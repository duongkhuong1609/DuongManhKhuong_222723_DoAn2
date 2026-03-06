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
        m.MaMon AS id,
        m.TenMon AS name,
        m.SoTinChi AS credits,
        m.SoTiet AS periods,
        m.LoaiMon AS type,
        n.TenNganh AS major,
        m.NamM AS year,
        m.HocKy AS semester
      FROM MON m
      LEFT JOIN NGANH n ON m.MaNganh = n.MaNganh
      ORDER BY m.TenMon ASC
    `)
    await pool.close()

    const mapped = result.recordset.map((row: any) => ({
      id: row.id,
      name: String(row.name || '').trim(),
      credits: Number(row.credits || 0),
      periods: Number(row.periods || 0),
      type: String(row.type || '').trim(),
      major: String(row.major || '').trim(),
      year: String(row.year || '').trim(),
      semester: String(row.semester || '').trim(),
    }))

    return NextResponse.json({ success: true, data: mapped })
  } catch (error) {
    console.error("Error fetching courses via mssql:", error)
    return NextResponse.json({ success: false, data: [], error: "Lỗi khi tải danh sách môn học" }, { status: 500 })
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
