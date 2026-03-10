import { NextRequest, NextResponse } from "next/server"

const sql = require("mssql")

const dbConfig = {
  server: "localhost",
  instanceName: "SQLEXPRESS",
  database: "LAP_LICH_TU_DONG",
  authentication: { type: "default", options: { userName: "sa", password: "123456" } },
  options: { encrypt: false, trustServerCertificate: true },
}

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

export async function GET(request: NextRequest) {
  let pool: any
  try {
    const maGV = String(request.nextUrl.searchParams.get("maGV") || "").trim()

    pool = await new sql.ConnectionPool(dbConfig).connect()

    if (!maGV) {
      const result = await pool.request().query(`
        SELECT
          gv.MaGV,
          gv.TenGV,
          gv.EmailGV,
          k.TenKhoa AS department,
          (
            SELECT COUNT(1)
            FROM NGUYEN_VONG_THOI_GIAN nvtg
            WHERE nvtg.MaGV = gv.MaGV
          ) AS timeCount,
          (
            SELECT COUNT(1)
            FROM NGUYEN_VONG_KHAC nvk
            WHERE nvk.MaGV = gv.MaGV
          ) AS otherCount
        FROM GIANG_VIEN gv
        LEFT JOIN KHOA k ON gv.MaKhoa = k.MaKhoa
        WHERE EXISTS (
          SELECT 1 FROM NGUYEN_VONG_THOI_GIAN nvtg WHERE nvtg.MaGV = gv.MaGV
        )
        OR EXISTS (
          SELECT 1 FROM NGUYEN_VONG_KHAC nvk WHERE nvk.MaGV = gv.MaGV
        )
        ORDER BY gv.TenGV ASC
      `)

      const data = (result.recordset || []).map((row: any) => ({
        maGV: String(row.MaGV || "").trim(),
        tenGV: String(row.TenGV || "").trim(),
        emailGV: String(row.EmailGV || "").trim(),
        department: String(row.department || "").trim(),
        timeCount: Number(row.timeCount || 0),
        otherCount: Number(row.otherCount || 0),
      }))

      return NextResponse.json({ success: true, data })
    }

    const [timeColumns, otherColumns] = await Promise.all([
      getTableColumns(pool, "NGUYEN_VONG_THOI_GIAN"),
      getTableColumns(pool, "NGUYEN_VONG_KHAC"),
    ])

    const timeIdColumn = resolveTimeIdColumn(timeColumns)
    const otherNameColumn = resolveOtherNameColumn(otherColumns)

    const [timeResult, otherResult] = await Promise.all([
      pool
        .request()
        .input("maGV", maGV)
        .query(`
          SELECT ${timeIdColumn} AS preferenceId, ThuTrongTuan, TietDay, MucDoUuTien
          FROM NGUYEN_VONG_THOI_GIAN
          WHERE MaGV = @maGV
          ORDER BY preferenceId DESC
        `),
      pool
        .request()
        .input("maGV", maGV)
        .query(`
          SELECT MaNVK, ${otherNameColumn} AS TenNV, GiaTri
          FROM NGUYEN_VONG_KHAC
          WHERE MaGV = @maGV
          ORDER BY MaNVK DESC
        `),
    ])

    const timePreferences = (timeResult.recordset || []).map((row: any) => ({
      id: Number(row.preferenceId || 0),
      thuTrongTuan: String(row.ThuTrongTuan || "").trim(),
      tietDay: String(row.TietDay || "").trim(),
      mucDoUuTien: String(row.MucDoUuTien ?? "").trim(),
    }))

    const otherPreferences = (otherResult.recordset || []).map((row: any) => ({
      id: Number(row.MaNVK || 0),
      tenNV: String(row.TenNV || "").trim(),
      giaTri: String(row.GiaTri || "").trim(),
    }))

    return NextResponse.json({ success: true, data: { timePreferences, otherPreferences } })
  } catch (error) {
    console.error("Error loading instructor preferences:", error)
    return NextResponse.json({ success: false, error: "Lỗi khi tải nguyện vọng giảng viên" }, { status: 500 })
  } finally {
    if (pool) await pool.close()
  }
}

export async function PUT(request: NextRequest) {
  let pool: any
  try {
    const body = await request.json()
    const maGV = String(body.maGV || "").trim()
    const preferenceId = Number(body.preferenceId)
    const mucDoUuTien = Number(body.mucDoUuTien)

    if (!maGV || !Number.isFinite(preferenceId) || preferenceId <= 0) {
      return NextResponse.json({ success: false, error: "Thiếu dữ liệu cập nhật nguyện vọng thời gian" }, { status: 400 })
    }

    if (!Number.isInteger(mucDoUuTien) || mucDoUuTien < 1 || mucDoUuTien > 3) {
      return NextResponse.json({ success: false, error: "Mức độ ưu tiên chỉ được nhập 1, 2 hoặc 3" }, { status: 400 })
    }

    pool = await new sql.ConnectionPool(dbConfig).connect()

    const timeColumns = await getTableColumns(pool, "NGUYEN_VONG_THOI_GIAN")
    const timeIdColumn = resolveTimeIdColumn(timeColumns)

    const result = await pool
      .request()
      .input("preferenceId", sql.Int, preferenceId)
      .input("maGV", maGV)
      .input("mucDoUuTien", String(mucDoUuTien))
      .query(`
        UPDATE NGUYEN_VONG_THOI_GIAN
        SET MucDoUuTien = @mucDoUuTien
        WHERE ${timeIdColumn} = @preferenceId AND MaGV = @maGV
      `)

    if (!result.rowsAffected || result.rowsAffected[0] === 0) {
      return NextResponse.json({ success: false, error: "Không tìm thấy nguyện vọng thời gian để cập nhật" }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error updating time preference priority:", error)
    return NextResponse.json({ success: false, error: "Lỗi khi cập nhật mức độ ưu tiên" }, { status: 500 })
  } finally {
    if (pool) await pool.close()
  }
}
