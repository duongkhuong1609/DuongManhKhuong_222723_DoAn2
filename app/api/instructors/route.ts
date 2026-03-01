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
  return NextResponse.json({ success: false, error: "Chức năng chưa được hỗ trợ" }, { status: 501 })
}
export async function PUT(request: NextRequest) {
  return NextResponse.json({ success: false, error: "Chức năng chưa được hỗ trợ" }, { status: 501 })
}
export async function DELETE(request: NextRequest) {
  return NextResponse.json({ success: false, error: "Chức năng chưa được hỗ trợ" }, { status: 501 })
}
