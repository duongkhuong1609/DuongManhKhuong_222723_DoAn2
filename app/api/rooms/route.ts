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
      SELECT ph.TenPhong AS roomName,
             kh.TenKhu AS building,
             ph.LoaiPhong AS type,
             ph.TrangThai AS status
      FROM PHONG ph
      LEFT JOIN KHU kh ON ph.MaKhu = kh.MaKhu
    `)
    await pool.close()

    const mapped = result.recordset.map((row: any) => ({
      code: row.roomName,
      building: row.building,
      type: row.type,
      status: row.status,
    }))

    return NextResponse.json({ success: true, data: mapped })
  } catch (error) {
    console.error("Error fetching rooms via mssql:", error)
    // return empty list so UI doesn't crash
    return NextResponse.json({ success: false, data: [] })
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
