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
  let pool: any
  try {
    const { searchParams } = new URL(request.url)
    const instructorCode = String(searchParams.get('code') || '').trim()

    if (!instructorCode) {
      return NextResponse.json({ success: false, error: 'Thiếu mã giảng viên', data: [] }, { status: 400 })
    }

    pool = await sql.connect(dbConfig)

    const result = await pool
      .request()
      .input('instructorCode', instructorCode)
      .query(`
        SELECT DISTINCT
          m.MaMon AS id,
          m.TenMon AS name,
          m.LoaiMon AS type,
          m.NamM AS year,
          m.HocKy AS semester,
          m.SoTinChi AS credits
        FROM CHUYEN_MON_CUA_GV cm
        INNER JOIN MON m ON cm.MaMon = m.MaMon
        WHERE cm.MaGV = @instructorCode
        ORDER BY m.TenMon ASC
      `)

    const data = result.recordset.map((row: any) => ({
      id: Number(row.id || 0),
      name: String(row.name || '').trim(),
      type: String(row.type || '').trim(),
      year: String(row.year || '').trim(),
      semester: String(row.semester || '').trim(),
      credits: Number(row.credits || 0),
    }))

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('Error fetching instructor courses via mssql:', error)
    return NextResponse.json({ success: false, error: 'Lỗi khi tải danh sách môn phụ trách', data: [] }, { status: 500 })
  } finally {
    if (pool) {
      await pool.close()
    }
  }
}
