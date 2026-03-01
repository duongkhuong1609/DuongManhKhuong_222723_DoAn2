import { NextRequest, NextResponse } from "next/server"
// use mssql driver directly to query database without Prisma
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
    const academicYear = searchParams.get("academicYear")
    const status = searchParams.get("status")
    const current = searchParams.get("current")

    const pool = await sql.connect(dbConfig)
    // legacy table HOC_KY stores semesters
    let query = `
      SELECT MaHK AS code,
             TenHK AS name,
             NamHK AS academicYear,
             TuNgay AS startDate,
             DenNgay AS endDate,
             TrangThai AS status
      FROM HOC_KY
    `;
    const conditions: string[] = [];
    const params: Record<string, any> = {};

    if (academicYear) {
      conditions.push("NamHK = @ay")
      params.ay = academicYear
    }
    if (status) {
      conditions.push("TrangThai = @st")
      params.st = status
    }
    // current filter can't be applied easily w/o an isCurrent column

    if (conditions.length) {
      query += " WHERE " + conditions.join(" AND ")
    }
    query += " ORDER BY NamHK DESC"

    const requestDb = pool.request()
    for (const key of Object.keys(params)) {
      requestDb.input(key, params[key])
    }

    const result = await requestDb.query(query)
    await pool.close()

    // map fields to expected Semester interface, adding defaults
    const mapped = result.recordset.map((row: any) => ({
      _id: row.code,
      code: row.code,
      name: row.name,
      shortName: row.name,
      semesterNumber: 0, // unknown
      academicYear: row.academicYear,
      startDate: row.startDate,
      endDate: row.endDate,
      isActive: true,
      isCurrent: false,
      status: row.status || 'upcoming',
    }))

    return NextResponse.json({ success: true, data: mapped })
  } catch (error) {
    console.error("Error fetching semesters via mssql:", error)
    return NextResponse.json({ success: false, error: "Lỗi khi tải danh sách học kỳ" }, { status: 500 })
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
