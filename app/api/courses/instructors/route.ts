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
    const courseIdParam = searchParams.get('courseId')
    const majorId = String(searchParams.get('majorId') || '').trim()
    const year = Number(searchParams.get('year'))
    const semester = Number(searchParams.get('semester'))
    const courseId = Number(courseIdParam)

    if (!courseIdParam && !majorId) {
      return NextResponse.json({ success: false, error: 'Thiếu courseId hoặc majorId', data: [] }, { status: 400 })
    }

    pool = await sql.connect(dbConfig)

    if (majorId) {
      const requestDb = pool
        .request()
        .input('majorId', majorId)

      const hasYear = Number.isFinite(year) && year > 0
      const hasSemester = Number.isFinite(semester) && semester > 0
      if (hasYear) requestDb.input('year', sql.Int, year)
      if (hasSemester) requestDb.input('semester', sql.Int, semester)

      const result = await requestDb.query(`
        SELECT DISTINCT
          gv.MaGV AS code,
          gv.TenGV AS name,
          gv.EmailGV AS email,
          gv.ChucVu AS position,
          k.TenKhoa AS department
        FROM NGANH n
        INNER JOIN KHOA k ON n.MaKhoa = k.MaKhoa
        INNER JOIN GIANG_VIEN gv ON gv.MaKhoa = k.MaKhoa
        INNER JOIN CHUYEN_MON_CUA_GV cm ON cm.MaGV = gv.MaGV
        INNER JOIN MON m ON m.MaMon = cm.MaMon
        WHERE n.MaNganh = @majorId
          AND m.MaNganh = n.MaNganh
          ${hasYear ? "AND TRY_CONVERT(INT, m.NamM) = @year" : ""}
          ${hasSemester ? "AND TRY_CONVERT(INT, m.HocKy) = @semester" : ""}
          AND UPPER(LTRIM(RTRIM(ISNULL(gv.TrangThai, '')))) IN (
            N'CÓ THỂ DẠY', N'CO THE DAY', N'ACTIVE', N'HOẠT ĐỘNG', N'HOAT DONG', N'ĐANG DẠY', N'DANG DAY'
          )
        ORDER BY gv.TenGV ASC
      `)

      const data = result.recordset.map((row: any) => ({
        code: String(row.code || '').trim(),
        name: String(row.name || '').trim(),
        email: String(row.email || '').trim(),
        position: String(row.position || '').trim(),
        department: String(row.department || '').trim(),
      }))

      return NextResponse.json({ success: true, data })
    }

    if (Number.isNaN(courseId) || courseId <= 0) {
      return NextResponse.json({ success: false, error: 'Mã môn không hợp lệ', data: [] }, { status: 400 })
    }

    const result = await pool
      .request()
      .input('courseId', sql.Int, courseId)
      .query(`
        SELECT DISTINCT
          gv.MaGV AS code,
          gv.TenGV AS name,
          gv.EmailGV AS email,
          gv.ChucVu AS position,
          k.TenKhoa AS department
        FROM CHUYEN_MON_CUA_GV cm
        INNER JOIN GIANG_VIEN gv ON cm.MaGV = gv.MaGV
        INNER JOIN MON m ON m.MaMon = cm.MaMon
        INNER JOIN NGANH n ON n.MaNganh = m.MaNganh
        INNER JOIN KHOA k ON k.MaKhoa = n.MaKhoa AND gv.MaKhoa = k.MaKhoa
        WHERE cm.MaMon = @courseId
          AND UPPER(LTRIM(RTRIM(ISNULL(gv.TrangThai, '')))) IN (
            N'CÓ THỂ DẠY', N'CO THE DAY', N'ACTIVE', N'HOẠT ĐỘNG', N'HOAT DONG', N'ĐANG DẠY', N'DANG DAY'
          )
        ORDER BY gv.TenGV ASC
      `)

    const data = result.recordset.map((row: any) => ({
      code: String(row.code || '').trim(),
      name: String(row.name || '').trim(),
      email: String(row.email || '').trim(),
      position: String(row.position || '').trim(),
      department: String(row.department || '').trim(),
    }))

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('Error fetching course instructors via mssql:', error)
    return NextResponse.json({ success: false, error: 'Lỗi khi tải giảng viên phụ trách môn', data: [] }, { status: 500 })
  } finally {
    if (pool) {
      await pool.close()
    }
  }
}
