import { NextRequest, NextResponse } from "next/server"
import { decodeSession, SESSION_COOKIE_NAME } from "@/lib/auth-session"

const sql = require("mssql")

const dbConfig = {
  server: "localhost",
  instanceName: "SQLEXPRESS",
  database: "LAP_LICH_TU_DONG",
  authentication: { type: "default", options: { userName: "sa", password: "123456" } },
  options: { encrypt: false, trustServerCertificate: true },
}

const ALLOWED_WEEKDAYS = ["Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7", "Chủ nhật"]
const ALLOWED_SESSIONS = ["Sáng", "Chiều"]

const getTableColumns = async (pool: any, tableName: string): Promise<Set<string>> => {
  const result = await pool
    .request()
    .input("tableName", tableName)
    .query(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = @tableName
    `)

  return new Set<string>((result.recordset || []).map((row: any) => String(row.COLUMN_NAME || "").toLowerCase()))
}

const resolveTimeIdColumn = (columns: Set<string>) => {
  if (columns.has("manvtg")) return "MaNVTG"
  if (columns.has("manvg")) return "MaNVG"
  return "MaNVTG"
}

const resolveOtherNameColumn = (columns: Set<string>) => {
  if (columns.has("tennvk")) return "TenNVK"
  if (columns.has("tennv")) return "TenNV"
  if (columns.has("loainv")) return "LoaiNV"
  return "TenNVK"
}

const resolveOtherIdColumn = (columns: Set<string>) => {
  if (columns.has("manvk")) return "MaNVK"
  return "MaNVK"
}

const resolveOtherStatusColumn = (columns: Set<string>) => {
  if (columns.has("trangthaiduyet")) return "TrangThaiDuyet"
  if (columns.has("trangthai")) return "TrangThai"
  return "TrangThaiDuyet"
}

const normalizeApprovalStatus = (value: unknown) => {
  const raw = String(value || "").trim().toLowerCase()
  if (!raw) return "Chưa duyệt"
  if (raw === "1" || raw.includes("da duyet") || raw.includes("đã duyệt") || raw.includes("approved")) {
    return "Đã duyệt"
  }
  if (raw === "2" || raw.includes("khong duyet") || raw.includes("không duyệt") || raw.includes("rejected")) {
    return "Không duyệt"
  }
  if (raw === "0" || raw.includes("chua duyet") || raw.includes("chưa duyệt") || raw.includes("pending")) {
    return "Chưa duyệt"
  }
  return "Chưa duyệt"
}

const isIdentityColumn = async (pool: any, tableName: string, columnName: string) => {
  const result = await pool
    .request()
    .input("tableName", tableName)
    .input("columnName", columnName)
    .query(`
      SELECT COLUMNPROPERTY(OBJECT_ID(@tableName), @columnName, 'IsIdentity') AS IsIdentity
    `)

  return Number(result.recordset?.[0]?.IsIdentity || 0) === 1
}

export async function GET(request: NextRequest) {
  let pool: any
  try {
    const rawSession = request.cookies.get(SESSION_COOKIE_NAME)?.value
    const session = decodeSession(rawSession)

    if (!session) {
      return NextResponse.json({ success: false, error: "Chưa đăng nhập" }, { status: 401 })
    }

    if (!session.maGV) {
      return NextResponse.json({ success: true, data: { timePreferences: [], otherPreferences: [] } })
    }

    pool = await new sql.ConnectionPool(dbConfig).connect()

    const [timeColumns, otherColumns] = await Promise.all([
      getTableColumns(pool, "NGUYEN_VONG_THOI_GIAN"),
      getTableColumns(pool, "NGUYEN_VONG_KHAC"),
    ])

    const timeIdColumn = resolveTimeIdColumn(timeColumns)
    const otherNameColumn = resolveOtherNameColumn(otherColumns)
    const otherIdColumn = resolveOtherIdColumn(otherColumns)
    const hasOtherStatusColumn = otherColumns.has("trangthaiduyet") || otherColumns.has("trangthai")
    const otherStatusColumn = resolveOtherStatusColumn(otherColumns)

    const [timeResult, otherResult] = await Promise.all([
      pool
        .request()
        .input("maGV", session.maGV)
        .query(`
          SELECT ${timeIdColumn} AS preferenceId, MaGV, ThuTrongTuan, TietDay, MucDoUuTien
          FROM NGUYEN_VONG_THOI_GIAN
          WHERE MaGV = @maGV
          ORDER BY preferenceId DESC
        `),
      pool
        .request()
        .input("maGV", session.maGV)
        .query(`
          SELECT ${otherIdColumn} AS preferenceId, MaGV, ${otherNameColumn} AS TenNVK, GiaTri,
                 ${hasOtherStatusColumn ? `CAST(${otherStatusColumn} AS NVARCHAR(50))` : "CAST(N'Chưa duyệt' AS NVARCHAR(50))"} AS TrangThaiDuyet
          FROM NGUYEN_VONG_KHAC
          WHERE MaGV = @maGV
          ORDER BY preferenceId DESC
        `),
    ])

    const timePreferences = (timeResult.recordset || []).map((row: any) => ({
      maNVTG: String(row.preferenceId || "").trim(),
      maGV: String(row.MaGV || "").trim(),
      thuTrongTuan: String(row.ThuTrongTuan || "").trim(),
      tietDay: String(row.TietDay || "").trim(),
      mucDoUuTien: String(row.MucDoUuTien ?? "").trim(),
    }))

    const otherPreferences = (otherResult.recordset || []).map((row: any) => ({
      maNVK: String(row.preferenceId || "").trim(),
      maGV: String(row.MaGV || "").trim(),
      tenNV: String(row.TenNVK || "").trim(),
      giaTri: String(row.GiaTri || "").trim(),
      trangThaiDuyet: normalizeApprovalStatus(row.TrangThaiDuyet),
    }))

    return NextResponse.json({
      success: true,
      data: {
        timePreferences,
        otherPreferences,
      },
    })
  } catch (error) {
    console.error("Error fetching user preferences:", error)
    return NextResponse.json({ success: false, error: "Lỗi khi tải nguyện vọng" }, { status: 500 })
  } finally {
    if (pool) await pool.close()
  }
}

export async function POST(request: NextRequest) {
  let pool: any
  try {
    const rawSession = request.cookies.get(SESSION_COOKIE_NAME)?.value
    const session = decodeSession(rawSession)

    if (!session) {
      return NextResponse.json({ success: false, error: "Chưa đăng nhập" }, { status: 401 })
    }

    if (!session.maGV) {
      return NextResponse.json({ success: false, error: "Tài khoản chưa liên kết giảng viên" }, { status: 400 })
    }

    const body = await request.json()
    const type = String(body.type || "").trim().toLowerCase()

    pool = await new sql.ConnectionPool(dbConfig).connect()

    const [timeColumns, otherColumns] = await Promise.all([
      getTableColumns(pool, "NGUYEN_VONG_THOI_GIAN"),
      getTableColumns(pool, "NGUYEN_VONG_KHAC"),
    ])

    if (type === "time") {
      const thuTrongTuan = String(body.thuTrongTuan || "").trim()
      const tietDay = String(body.tietDay || "").trim()

      if (!ALLOWED_WEEKDAYS.includes(thuTrongTuan) || !ALLOWED_SESSIONS.includes(tietDay)) {
        return NextResponse.json({ success: false, error: "Dữ liệu nguyện vọng thời gian không hợp lệ" }, { status: 400 })
      }

      const existingCountResult = await pool
        .request()
        .input("maGV", session.maGV)
        .query(`
          SELECT COUNT(1) AS total
          FROM NGUYEN_VONG_THOI_GIAN
          WHERE MaGV = @maGV
        `)

      const existingCount = Number(existingCountResult.recordset?.[0]?.total || 0)
      if (existingCount >= 2) {
        return NextResponse.json(
          { success: false, error: "Chỉ được thêm tối đa 2 nguyện vọng thời gian" },
          { status: 400 }
        )
      }

      await pool
        .request()
        .input("maGV", session.maGV)
        .input("thuTrongTuan", thuTrongTuan)
        .input("tietDay", tietDay)
        .input("mucDoUuTien", null)
        .query(`
        INSERT INTO NGUYEN_VONG_THOI_GIAN (MaGV, ThuTrongTuan, TietDay, MucDoUuTien)
        VALUES (@maGV, @thuTrongTuan, @tietDay, @mucDoUuTien)
      `)

      return NextResponse.json({ success: true }, { status: 201 })
    }

    if (type === "other") {
      const tenNV = String(body.tenNV || "").trim()
      const giaTri = String(body.giaTri || "").trim()
      const priority = Number(giaTri)

      if (!tenNV || !giaTri) {
        return NextResponse.json({ success: false, error: "Dữ liệu nguyện vọng khác không hợp lệ" }, { status: 400 })
      }

      if (!Number.isInteger(priority) || priority < 1 || priority > 3) {
        return NextResponse.json({ success: false, error: "Mức độ ưu tiên chỉ được nhập 1, 2 hoặc 3" }, { status: 400 })
      }

      const otherNameColumn = resolveOtherNameColumn(otherColumns)
      const otherIdColumn = resolveOtherIdColumn(otherColumns)
      const hasOtherStatusColumn = otherColumns.has("trangthaiduyet") || otherColumns.has("trangthai")
      const otherStatusColumn = resolveOtherStatusColumn(otherColumns)
      const idIsIdentity = await isIdentityColumn(pool, "NGUYEN_VONG_KHAC", otherIdColumn)
      const pendingStatus = "Chưa duyệt"

      if (idIsIdentity) {
        await pool
          .request()
          .input("maGV", session.maGV)
          .input("tenNV", tenNV)
          .input("giaTri", giaTri)
          .input("approvalStatus", pendingStatus)
          .query(`
            INSERT INTO NGUYEN_VONG_KHAC (MaGV, ${otherNameColumn}, GiaTri${hasOtherStatusColumn ? `, ${otherStatusColumn}` : ""})
            VALUES (@maGV, @tenNV, @giaTri${hasOtherStatusColumn ? ", @approvalStatus" : ""})
          `)
      } else {
        const maxIdResult = await pool.request().query(`
          SELECT ISNULL(MAX(${otherIdColumn}), 0) AS maxId
          FROM NGUYEN_VONG_KHAC
        `)
        const nextId = Number(maxIdResult.recordset?.[0]?.maxId || 0) + 1

        await pool
          .request()
          .input("id", sql.Int, nextId)
          .input("maGV", session.maGV)
          .input("tenNV", tenNV)
          .input("giaTri", giaTri)
          .input("approvalStatus", pendingStatus)
          .query(`
            INSERT INTO NGUYEN_VONG_KHAC (${otherIdColumn}, MaGV, ${otherNameColumn}, GiaTri${hasOtherStatusColumn ? `, ${otherStatusColumn}` : ""})
            VALUES (@id, @maGV, @tenNV, @giaTri${hasOtherStatusColumn ? ", @approvalStatus" : ""})
          `)
      }

      return NextResponse.json({ success: true }, { status: 201 })
    }

    return NextResponse.json({ success: false, error: "Loại nguyện vọng không hợp lệ" }, { status: 400 })
  } catch (error) {
    console.error("Error creating user preference:", error)
    return NextResponse.json({ success: false, error: "Lỗi khi thêm nguyện vọng" }, { status: 500 })
  } finally {
    if (pool) await pool.close()
  }
}

export async function PUT(request: NextRequest) {
  let pool: any
  try {
    const rawSession = request.cookies.get(SESSION_COOKIE_NAME)?.value
    const session = decodeSession(rawSession)

    if (!session) {
      return NextResponse.json({ success: false, error: "Chưa đăng nhập" }, { status: 401 })
    }

    if (!session.maGV) {
      return NextResponse.json({ success: false, error: "Tài khoản chưa liên kết giảng viên" }, { status: 400 })
    }

    const body = await request.json()
    const type = String(body.type || "").trim().toLowerCase()
    const id = Number(body.id)

    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ success: false, error: "ID nguyện vọng không hợp lệ" }, { status: 400 })
    }

    pool = await new sql.ConnectionPool(dbConfig).connect()

    if (type === "time") {
      const thuTrongTuan = String(body.thuTrongTuan || "").trim()
      const tietDay = String(body.tietDay || "").trim()

      if (!ALLOWED_WEEKDAYS.includes(thuTrongTuan) || !ALLOWED_SESSIONS.includes(tietDay)) {
        return NextResponse.json({ success: false, error: "Dữ liệu nguyện vọng thời gian không hợp lệ" }, { status: 400 })
      }

      const timeColumns = await getTableColumns(pool, "NGUYEN_VONG_THOI_GIAN")
      const timeIdColumn = resolveTimeIdColumn(timeColumns)

      const result = await pool
        .request()
        .input("id", sql.Int, id)
        .input("maGV", session.maGV)
        .input("thuTrongTuan", thuTrongTuan)
        .input("tietDay", tietDay)
        .query(`
          UPDATE NGUYEN_VONG_THOI_GIAN
          SET ThuTrongTuan = @thuTrongTuan,
              TietDay = @tietDay
          WHERE ${timeIdColumn} = @id AND MaGV = @maGV
        `)

      if (!result.rowsAffected || result.rowsAffected[0] === 0) {
        return NextResponse.json({ success: false, error: "Không tìm thấy nguyện vọng để cập nhật" }, { status: 404 })
      }

      return NextResponse.json({ success: true })
    }

    if (type === "other") {
      const tenNV = String(body.tenNV || "").trim()
      const giaTri = String(body.giaTri || "").trim()
      const priority = Number(giaTri)

      if (!tenNV || !giaTri) {
        return NextResponse.json({ success: false, error: "Dữ liệu nguyện vọng đặc biệt không hợp lệ" }, { status: 400 })
      }

      if (!Number.isInteger(priority) || priority < 1 || priority > 3) {
        return NextResponse.json({ success: false, error: "Mức độ ưu tiên chỉ được nhập 1, 2 hoặc 3" }, { status: 400 })
      }

      const otherColumns = await getTableColumns(pool, "NGUYEN_VONG_KHAC")
      const otherNameColumn = resolveOtherNameColumn(otherColumns)
      const otherIdColumn = resolveOtherIdColumn(otherColumns)
      const hasOtherStatusColumn = otherColumns.has("trangthaiduyet") || otherColumns.has("trangthai")
      const otherStatusColumn = resolveOtherStatusColumn(otherColumns)

      const result = await pool
        .request()
        .input("id", sql.Int, id)
        .input("maGV", session.maGV)
        .input("tenNV", tenNV)
        .input("giaTri", giaTri)
        .input("approvalStatus", "Chưa duyệt")
        .query(`
          UPDATE NGUYEN_VONG_KHAC
          SET ${otherNameColumn} = @tenNV,
              GiaTri = @giaTri
              ${hasOtherStatusColumn ? `, ${otherStatusColumn} = @approvalStatus` : ""}
          WHERE ${otherIdColumn} = @id AND MaGV = @maGV
        `)

      if (!result.rowsAffected || result.rowsAffected[0] === 0) {
        return NextResponse.json({ success: false, error: "Không tìm thấy nguyện vọng để cập nhật" }, { status: 404 })
      }

      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ success: false, error: "Loại nguyện vọng không hợp lệ" }, { status: 400 })
  } catch (error) {
    console.error("Error updating user preference:", error)
    return NextResponse.json({ success: false, error: "Lỗi khi cập nhật nguyện vọng" }, { status: 500 })
  } finally {
    if (pool) await pool.close()
  }
}

export async function DELETE(request: NextRequest) {
  let pool: any
  try {
    const rawSession = request.cookies.get(SESSION_COOKIE_NAME)?.value
    const session = decodeSession(rawSession)

    if (!session) {
      return NextResponse.json({ success: false, error: "Chưa đăng nhập" }, { status: 401 })
    }

    if (!session.maGV) {
      return NextResponse.json({ success: false, error: "Tài khoản chưa liên kết giảng viên" }, { status: 400 })
    }

    const body = await request.json()
    const type = String(body.type || "").trim().toLowerCase()
    const id = Number(body.id)

    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ success: false, error: "ID nguyện vọng không hợp lệ" }, { status: 400 })
    }

    pool = await new sql.ConnectionPool(dbConfig).connect()

    if (type === "time") {
      const timeColumns = await getTableColumns(pool, "NGUYEN_VONG_THOI_GIAN")
      const timeIdColumn = resolveTimeIdColumn(timeColumns)

      const result = await pool
        .request()
        .input("id", sql.Int, id)
        .input("maGV", session.maGV)
        .query(`
          DELETE FROM NGUYEN_VONG_THOI_GIAN
          WHERE ${timeIdColumn} = @id AND MaGV = @maGV
        `)

      if (!result.rowsAffected || result.rowsAffected[0] === 0) {
        return NextResponse.json({ success: false, error: "Không tìm thấy nguyện vọng để xóa" }, { status: 404 })
      }

      return NextResponse.json({ success: true })
    }

    if (type === "other") {
      const otherColumns = await getTableColumns(pool, "NGUYEN_VONG_KHAC")
      const otherIdColumn = resolveOtherIdColumn(otherColumns)

      const result = await pool
        .request()
        .input("id", sql.Int, id)
        .input("maGV", session.maGV)
        .query(`
          DELETE FROM NGUYEN_VONG_KHAC
          WHERE ${otherIdColumn} = @id AND MaGV = @maGV
        `)

      if (!result.rowsAffected || result.rowsAffected[0] === 0) {
        return NextResponse.json({ success: false, error: "Không tìm thấy nguyện vọng để xóa" }, { status: 404 })
      }

      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ success: false, error: "Loại nguyện vọng không hợp lệ" }, { status: 400 })
  } catch (error) {
    console.error("Error deleting user preference:", error)
    return NextResponse.json({ success: false, error: "Lỗi khi xóa nguyện vọng" }, { status: 500 })
  } finally {
    if (pool) await pool.close()
  }
}
