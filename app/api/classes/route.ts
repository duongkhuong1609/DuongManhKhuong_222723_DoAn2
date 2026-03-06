import { NextRequest, NextResponse } from "next/server"
const sql = require('mssql')

const dbConfig = {
  server: 'localhost',
  instanceName: 'SQLEXPRESS',
  database: 'LAP_LICH_TU_DONG',
  authentication: { type: 'default', options: { userName: 'sa', password: '123456' } },
  options: { encrypt: false, trustServerCertificate: true }
}

export async function GET(request: NextRequest) {
  try {
    const pool = await sql.connect(dbConfig)
    const result = await pool.request().query(`
      SELECT
        l.MaLop AS id,
        l.TenLop AS name,
        n.TenNganh AS major,
        k.TenKhoa AS department,
        l.Nam AS year
      FROM LOP l
      LEFT JOIN NGANH n ON l.MaNganh = n.MaNganh
      LEFT JOIN KHOA k ON n.MaKhoa = k.MaKhoa
      ORDER BY l.TenLop ASC
    `)
    await pool.close()

    const mapped = result.recordset.map((row: any) => ({
      id: row.id,
      name: String(row.name || '').trim(),
      major: String(row.major || '').trim(),
      department: String(row.department || '').trim(),
      year: String(row.year || '').trim(),
    }))

    return NextResponse.json({ success: true, data: mapped })
  } catch (error) {
    console.error("Error fetching classes via mssql:", error)
    return NextResponse.json({ success: false, data: [], error: "Lỗi khi tải danh sách lớp học" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  return NextResponse.json({ success: false, error: "Chức năng chưa được hỗ trợ" }, { status: 501 })
}

export async function PUT(request: NextRequest) {
  return NextResponse.json({ success: false, error: "Chức năng chưa được hỗ trợ" }, { status: 501 })
}

export async function DELETE(request: NextRequest) {
  return NextResponse.json({ success: false, error: "Chức năng chưa được hỗ trợ" }, { status: 501 })
}
