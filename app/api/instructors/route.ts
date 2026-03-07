import { NextRequest, NextResponse } from "next/server"

// use mssql driver directly because legacy tables are not managed by Prisma
const sql = require('mssql');

const dbConfig = {
  server: 'localhost',
  instanceName: 'SQLEXPRESS',
  database: 'LAP_LICH_TU_DONG',
  authentication: { type: 'default', options: { userName: 'sa', password: '123456' } },
  options: { encrypt: false, trustServerCertificate: true }
};

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const department = searchParams.get("department")
    const status = searchParams.get("status")
    const search = searchParams.get("search")

    let pool
    try {
      pool = await sql.connect(dbConfig)
    } catch (connErr) {
      console.error("Instructor API connection error:", connErr)
      // return empty list instead of bubbling error
      return NextResponse.json({ success: true, data: [] })
    }

    let query = `
      SELECT gi.MaGV AS code,
             gi.TenGV AS name,
             gi.EmailGV AS email,
             gi.ChucVu AS position,
             k.TenKhoa AS department,
             gi.TrangThai AS status
      FROM GIANG_VIEN gi
      LEFT JOIN KHOA k ON gi.MaKhoa = k.MaKhoa
    `
    const conditions: string[] = []
    const params: Record<string, any> = {}

    if (department) {
      conditions.push("k.TenKhoa = @dept")
      params.dept = department
    }
    if (status) {
      conditions.push("gi.TrangThai = @stat")
      params.stat = status
    }
    if (search) {
      conditions.push("(gi.TenGV LIKE @search OR gi.MaGV LIKE @search OR gi.EmailGV LIKE @search)")
      params.search = `%${search}%`
    }

    if (conditions.length) {
      query += " WHERE " + conditions.join(" AND ")
    }
    query += " ORDER BY gi.TenGV ASC"

    const requestDb = pool.request()
    for (const key of Object.keys(params)) {
      requestDb.input(key, params[key])
    }

    const result = await requestDb.query(query)
    await pool.close()

    return NextResponse.json({ success: true, data: result.recordset })
  } catch (error) {
    console.error("Error fetching instructors via mssql:", error)
    // on unexpected failure return empty array
    return NextResponse.json({ success: true, data: [] })
  }
}

// other methods not supported for now
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const name = String(body.name || "").trim()
    const email = String(body.email || "").trim()
    const position = String(body.position || "").trim()
    const status = String(body.status || "").trim()
    const department = String(body.department || "").trim()

    if (!name || !email || !position || !status || !department) {
      return NextResponse.json({ success: false, error: "Thiếu thông tin bắt buộc" }, { status: 400 })
    }

    const pool = await sql.connect(dbConfig)

    const duplicateNameEmail = await pool
      .request()
      .input("name", name)
      .input("email", email)
      .query(`
        SELECT TOP 1 MaGV
        FROM GIANG_VIEN
        WHERE TenGV = @name AND EmailGV = @email
      `)

    if (duplicateNameEmail.recordset.length > 0) {
      await pool.close()
      return NextResponse.json({ success: false, error: "Trùng cả họ tên và email giảng viên" }, { status: 400 })
    }

    const duplicateEmail = await pool
      .request()
      .input("email", email)
      .query(`
        SELECT TOP 1 MaGV
        FROM GIANG_VIEN
        WHERE EmailGV = @email
      `)

    if (duplicateEmail.recordset.length > 0) {
      await pool.close()
      return NextResponse.json({ success: false, error: "Email giảng viên đã tồn tại" }, { status: 400 })
    }

    const deptResult = await pool
      .request()
      .input("department", department)
      .query(`
        SELECT TOP 1 MaKhoa
        FROM KHOA
        WHERE TenKhoa = @department
      `)

    if (!deptResult.recordset.length) {
      await pool.close()
      return NextResponse.json({ success: false, error: "Không tìm thấy khoa/bộ môn tương ứng" }, { status: 400 })
    }

    const maKhoa = deptResult.recordset[0].MaKhoa

    const maTkColResult = await pool.request().query(`
      SELECT 1 AS hasCol
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'GIANG_VIEN' AND COLUMN_NAME = 'MaTK'
    `)

    const hasMaTK = maTkColResult.recordset.length > 0

    const insertSql = hasMaTK
      ? `
        INSERT INTO GIANG_VIEN (TenGV, EmailGV, ChucVu, TrangThai, MaKhoa, MaTK)
        OUTPUT INSERTED.MaGV
        VALUES (@name, @email, @position, @status, @maKhoa, NULL)
      `
      : `
        INSERT INTO GIANG_VIEN (TenGV, EmailGV, ChucVu, TrangThai, MaKhoa)
        OUTPUT INSERTED.MaGV
        VALUES (@name, @email, @position, @status, @maKhoa)
      `

    const insertResult = await pool
      .request()
      .input("name", name)
      .input("email", email)
      .input("position", position)
      .input("status", status)
      .input("maKhoa", maKhoa)
      .query(insertSql)

    const insertedCode = insertResult.recordset?.[0]?.MaGV

    await pool.close()

    return NextResponse.json({ success: true, data: { code: insertedCode } }, { status: 201 })
  } catch (error) {
    console.error("Error creating instructor via mssql:", error)
    return NextResponse.json({ success: false, error: "Lỗi khi thêm giảng viên" }, { status: 500 })
  }
}
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const code = body.code
    const name = String(body.name || "").trim()
    const email = String(body.email || "").trim()
    const position = String(body.position || "").trim()
    const status = String(body.status || "").trim()
    const department = String(body.department || "").trim()

    if (!code || !name || !email || !position || !status || !department) {
      return NextResponse.json({ success: false, error: "Thiếu thông tin cập nhật" }, { status: 400 })
    }

    const pool = await sql.connect(dbConfig)

    const duplicateNameEmail = await pool
      .request()
      .input("code", code)
      .input("name", name)
      .input("email", email)
      .query(`
        SELECT TOP 1 MaGV
        FROM GIANG_VIEN
        WHERE TenGV = @name AND EmailGV = @email AND MaGV <> @code
      `)

    if (duplicateNameEmail.recordset.length > 0) {
      await pool.close()
      return NextResponse.json({ success: false, error: "Trùng cả họ tên và email giảng viên" }, { status: 400 })
    }

    const duplicateEmail = await pool
      .request()
      .input("code", code)
      .input("email", email)
      .query(`
        SELECT TOP 1 MaGV
        FROM GIANG_VIEN
        WHERE EmailGV = @email AND MaGV <> @code
      `)

    if (duplicateEmail.recordset.length > 0) {
      await pool.close()
      return NextResponse.json({ success: false, error: "Email giảng viên đã tồn tại" }, { status: 400 })
    }

    const deptResult = await pool
      .request()
      .input("department", department)
      .query(`
        SELECT TOP 1 MaKhoa
        FROM KHOA
        WHERE TenKhoa = @department
      `)

    if (!deptResult.recordset.length) {
      await pool.close()
      return NextResponse.json({ success: false, error: "Không tìm thấy khoa/bộ môn tương ứng" }, { status: 400 })
    }

    const maKhoa = deptResult.recordset[0].MaKhoa

    const updateResult = await pool
      .request()
      .input("code", code)
      .input("name", name)
      .input("email", email)
      .input("position", position)
      .input("status", status)
      .input("maKhoa", maKhoa)
      .query(`
        UPDATE GIANG_VIEN
        SET TenGV = @name,
            EmailGV = @email,
            ChucVu = @position,
            TrangThai = @status,
            MaKhoa = @maKhoa
        WHERE MaGV = @code
      `)

    await pool.close()

    if (!updateResult.rowsAffected || updateResult.rowsAffected[0] === 0) {
      return NextResponse.json({ success: false, error: "Không tìm thấy giảng viên để cập nhật" }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error updating instructor via mssql:", error)
    return NextResponse.json({ success: false, error: "Lỗi khi cập nhật giảng viên" }, { status: 500 })
  }
}
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json()
    const code = body.code

    if (!code) {
      return NextResponse.json({ success: false, error: "Thiếu mã giảng viên để xóa" }, { status: 400 })
    }

    const pool = await sql.connect(dbConfig)
    const deleteResult = await pool
      .request()
      .input("code", code)
      .query(`
        DELETE FROM GIANG_VIEN
        WHERE MaGV = @code
      `)

    await pool.close()

    if (!deleteResult.rowsAffected || deleteResult.rowsAffected[0] === 0) {
      return NextResponse.json({ success: false, error: "Không tìm thấy giảng viên để xóa" }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting instructor via mssql:", error)
    return NextResponse.json({ success: false, error: "Lỗi khi xóa giảng viên" }, { status: 500 })
  }
}
