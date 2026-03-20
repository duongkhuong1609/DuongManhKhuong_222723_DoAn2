import { NextRequest, NextResponse } from "next/server"
import { MSSQL_DB_CONFIG } from "@/lib/db-config"
const sql = require('mssql')

const dbConfig = MSSQL_DB_CONFIG

const normalizeInstructorCodes = (value: unknown): string[] => {
  if (!Array.isArray(value)) return []

  return Array.from(
    new Set(
      value
        .map((item) => String(item || '').trim())
        .filter(Boolean)
    )
  )
}

const getValidInstructorCodesForMajor = async (
  pool: any,
  majorId: string,
  instructorCodes: string[],
  year?: number,
  semester?: number
) => {
  if (instructorCodes.length === 0) return [] as string[]

  const request = pool.request().input('majorId', majorId)
  const hasYear = Number.isFinite(year) && (year || 0) > 0
  const hasSemester = Number.isFinite(semester) && (semester || 0) > 0

  if (hasYear) request.input('year', sql.Int, year)
  if (hasSemester) request.input('semester', sql.Int, semester)

  const placeholders = instructorCodes.map((code, index) => {
    const param = `code${index}`
    request.input(param, code)
    return `@${param}`
  })

  const result = await request.query(`
    WITH ValidExpertiseLoad AS (
      SELECT
        gv2.MaGV,
        COUNT(DISTINCT cm2.MaMon) AS courseCount
      FROM GIANG_VIEN gv2
      INNER JOIN CHUYEN_MON_CUA_GV cm2 ON cm2.MaGV = gv2.MaGV
      INNER JOIN MON m2 ON m2.MaMon = cm2.MaMon
      INNER JOIN NGANH n2 ON n2.MaNganh = m2.MaNganh
      WHERE CAST(gv2.MaKhoa AS NVARCHAR(50)) = CAST(n2.MaKhoa AS NVARCHAR(50))
      GROUP BY gv2.MaGV
    )
    SELECT DISTINCT gv.MaGV AS code
    FROM NGANH n
    INNER JOIN GIANG_VIEN gv ON gv.MaKhoa = n.MaKhoa
    INNER JOIN CHUYEN_MON_CUA_GV cm ON cm.MaGV = gv.MaGV
    INNER JOIN MON m ON m.MaMon = cm.MaMon
    INNER JOIN ValidExpertiseLoad vel ON vel.MaGV = gv.MaGV
    WHERE n.MaNganh = @majorId
      AND m.MaNganh = n.MaNganh
      ${hasYear ? "AND TRY_CONVERT(INT, m.NamM) = @year" : ""}
      ${hasSemester ? "AND TRY_CONVERT(INT, m.HocKy) = @semester" : ""}
      AND vel.courseCount BETWEEN 3 AND 5
      AND UPPER(LTRIM(RTRIM(ISNULL(gv.TrangThai, '')))) IN (
        N'CÓ THỂ DẠY', N'CO THE DAY', N'ACTIVE', N'HOẠT ĐỘNG', N'HOAT DONG', N'ĐANG DẠY', N'DANG DAY'
      )
      AND gv.MaGV IN (${placeholders.join(', ')})
  `)

  return result.recordset.map((row: any) => String(row.code || '').trim())
}

const replaceCourseInstructorAssignments = async (pool: any, courseId: number, instructorCodes: string[]) => {
  await pool
    .request()
    .input('courseId', sql.Int, courseId)
    .query(`DELETE FROM CHUYEN_MON_CUA_GV WHERE MaMon = @courseId`)

  for (const code of instructorCodes) {
    await pool
      .request()
      .input('courseId', sql.Int, courseId)
      .input('instructorCode', code)
      .query(`
        INSERT INTO CHUYEN_MON_CUA_GV (MaGV, MaMon)
        VALUES (@instructorCode, @courseId)
      `)
  }
}

export async function GET(request: NextRequest) {
  try {
    const pool = await sql.connect(dbConfig)
    const result = await pool.request().query(`
      SELECT
        m.MaMon AS id,
        m.MaNganh AS majorId,
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
      majorId: String(row.majorId || '').trim(),
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
  let pool: any
  try {
    const body = await request.json()
    const majorId = String(body.majorId || '').trim()
    const name = String(body.name || '').trim()
    const type = String(body.type || '').trim()
    const credits = Number(body.credits)
    const year = Number(body.year)
    const semester = Number(body.semester)
    const instructorCodes = normalizeInstructorCodes(body.instructorCodes)

    if (!majorId || !name || !type || Number.isNaN(credits) || Number.isNaN(year) || Number.isNaN(semester)) {
      return NextResponse.json({ success: false, error: 'Thiếu thông tin bắt buộc' }, { status: 400 })
    }

    if (credits <= 0) {
      return NextResponse.json({ success: false, error: 'Số tín chỉ phải lớn hơn 0' }, { status: 400 })
    }

    if (semester < 1 || semester > 10) {
      return NextResponse.json({ success: false, error: 'Học kỳ phải trong khoảng từ 1 đến 10' }, { status: 400 })
    }

    if (year < 1 || year > 10) {
      return NextResponse.json({ success: false, error: 'Năm phải trong khoảng từ 1 đến 10' }, { status: 400 })
    }

    const normalizedType = type.toLowerCase()
    const isPractice = normalizedType.includes('thực hành')
    const isTheory = normalizedType.includes('lý thuyết')

    if (!isPractice && !isTheory) {
      return NextResponse.json({ success: false, error: 'Loại học phần không hợp lệ' }, { status: 400 })
    }

    if (isPractice && !name.toLowerCase().includes('thực hành')) {
      return NextResponse.json(
        { success: false, error: 'Tên môn thực hành phải chứa chữ "thực hành"' },
        { status: 400 }
      )
    }

    const periods = credits * (isPractice ? 30 : 15)

    pool = await sql.connect(dbConfig)

    const majorExists = await pool
      .request()
      .input('majorId', majorId)
      .query(`SELECT TOP 1 MaNganh FROM NGANH WHERE MaNganh = @majorId`)

    if (majorExists.recordset.length === 0) {
      return NextResponse.json({ success: false, error: 'Không tìm thấy ngành đã chọn' }, { status: 400 })
    }

    const duplicateCourse = await pool
      .request()
      .input('name', name)
      .input('majorId', majorId)
      .query(`SELECT TOP 1 MaMon FROM MON WHERE TenMon = @name AND MaNganh = @majorId`)

    if (duplicateCourse.recordset.length > 0) {
      return NextResponse.json({ success: false, error: 'Môn học đã tồn tại trong ngành đã chọn' }, { status: 400 })
    }

    const validInstructorCodes = await getValidInstructorCodesForMajor(
      pool,
      majorId,
      instructorCodes,
      year,
      semester
    )
    if (validInstructorCodes.length !== instructorCodes.length) {
      return NextResponse.json(
        { success: false, error: 'Danh sách giảng viên không hợp lệ với ngành đã chọn' },
        { status: 400 }
      )
    }

    const insertCourseResult = await pool
      .request()
      .input('name', name)
      .input('credits', sql.Int, credits)
      .input('periods', sql.Int, periods)
      .input('type', isPractice ? 'Thực hành' : 'Lý thuyết')
      .input('majorId', majorId)
      .input('year', sql.Int, year)
      .input('semester', sql.Int, semester)
      .query(`
        INSERT INTO MON (TenMon, SoTinChi, SoTiet, LoaiMon, MaNganh, NamM, HocKy)
        OUTPUT INSERTED.MaMon AS id
        VALUES (@name, @credits, @periods, @type, @majorId, @year, @semester)
      `)

    const createdCourseId = Number(insertCourseResult.recordset?.[0]?.id)
    if (!Number.isNaN(createdCourseId) && createdCourseId > 0) {
      await replaceCourseInstructorAssignments(pool, createdCourseId, validInstructorCodes)
    }

    return NextResponse.json({ success: true }, { status: 201 })
  } catch (error) {
    console.error('Error creating course via mssql:', error)
    return NextResponse.json({ success: false, error: 'Lỗi khi thêm môn học' }, { status: 500 })
  } finally {
    if (pool) {
      await pool.close()
    }
  }
}

export async function PUT(request: NextRequest) {
  let pool: any
  try {
    const body = await request.json()
    const id = Number(body.id)
    const majorId = String(body.majorId || '').trim()
    const name = String(body.name || '').trim()
    const type = String(body.type || '').trim()
    const credits = Number(body.credits)
    const year = Number(body.year)
    const semester = Number(body.semester)
    const instructorCodes = normalizeInstructorCodes(body.instructorCodes)

    if (Number.isNaN(id) || id <= 0 || !majorId || !name || !type || Number.isNaN(credits) || Number.isNaN(year) || Number.isNaN(semester)) {
      return NextResponse.json({ success: false, error: 'Thiếu thông tin bắt buộc' }, { status: 400 })
    }

    if (credits <= 0) {
      return NextResponse.json({ success: false, error: 'Số tín chỉ phải lớn hơn 0' }, { status: 400 })
    }

    if (semester < 1 || semester > 10) {
      return NextResponse.json({ success: false, error: 'Học kỳ phải trong khoảng từ 1 đến 10' }, { status: 400 })
    }

    if (year < 1 || year > 10) {
      return NextResponse.json({ success: false, error: 'Năm phải trong khoảng từ 1 đến 10' }, { status: 400 })
    }

    const normalizedType = type.toLowerCase()
    const isPractice = normalizedType.includes('thực hành')
    const isTheory = normalizedType.includes('lý thuyết')

    if (!isPractice && !isTheory) {
      return NextResponse.json({ success: false, error: 'Loại học phần không hợp lệ' }, { status: 400 })
    }

    if (isPractice && !name.toLowerCase().includes('thực hành')) {
      return NextResponse.json(
        { success: false, error: 'Tên môn thực hành phải chứa chữ "thực hành"' },
        { status: 400 }
      )
    }

    const periods = credits * (isPractice ? 30 : 15)

    pool = await sql.connect(dbConfig)

    const courseExists = await pool
      .request()
      .input('id', sql.Int, id)
      .query(`SELECT TOP 1 MaMon FROM MON WHERE MaMon = @id`)

    if (courseExists.recordset.length === 0) {
      return NextResponse.json({ success: false, error: 'Không tìm thấy môn cần cập nhật' }, { status: 404 })
    }

    const majorExists = await pool
      .request()
      .input('majorId', majorId)
      .query(`SELECT TOP 1 MaNganh FROM NGANH WHERE MaNganh = @majorId`)

    if (majorExists.recordset.length === 0) {
      return NextResponse.json({ success: false, error: 'Không tìm thấy ngành đã chọn' }, { status: 400 })
    }

    const duplicateCourse = await pool
      .request()
      .input('name', name)
      .input('majorId', majorId)
      .input('id', sql.Int, id)
      .query(`SELECT TOP 1 MaMon FROM MON WHERE TenMon = @name AND MaNganh = @majorId AND MaMon <> @id`)

    if (duplicateCourse.recordset.length > 0) {
      return NextResponse.json({ success: false, error: 'Môn học đã tồn tại trong ngành đã chọn' }, { status: 400 })
    }

    const validInstructorCodes = await getValidInstructorCodesForMajor(
      pool,
      majorId,
      instructorCodes,
      year,
      semester
    )
    if (validInstructorCodes.length !== instructorCodes.length) {
      return NextResponse.json(
        { success: false, error: 'Danh sách giảng viên không hợp lệ với ngành đã chọn' },
        { status: 400 }
      )
    }

    await pool
      .request()
      .input('id', sql.Int, id)
      .input('name', name)
      .input('credits', sql.Int, credits)
      .input('periods', sql.Int, periods)
      .input('type', isPractice ? 'Thực hành' : 'Lý thuyết')
      .input('majorId', majorId)
      .input('year', sql.Int, year)
      .input('semester', sql.Int, semester)
      .query(`
        UPDATE MON
        SET TenMon = @name,
            SoTinChi = @credits,
            SoTiet = @periods,
            LoaiMon = @type,
            MaNganh = @majorId,
            NamM = @year,
            HocKy = @semester
        WHERE MaMon = @id
      `)

    await replaceCourseInstructorAssignments(pool, id, validInstructorCodes)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error updating course via mssql:', error)
    return NextResponse.json({ success: false, error: 'Lỗi khi cập nhật môn học' }, { status: 500 })
  } finally {
    if (pool) {
      await pool.close()
    }
  }
}

export async function DELETE(request: NextRequest) {
  let pool: any
  try {
    const { searchParams } = new URL(request.url)
    const idParam = searchParams.get('id')
    const id = Number(idParam)

    if (!idParam || Number.isNaN(id) || id <= 0) {
      return NextResponse.json({ success: false, error: 'Mã môn không hợp lệ' }, { status: 400 })
    }

    pool = await sql.connect(dbConfig)

    const courseExists = await pool
      .request()
      .input('id', sql.Int, id)
      .query(`SELECT TOP 1 MaMon FROM MON WHERE MaMon = @id`)

    if (courseExists.recordset.length === 0) {
      return NextResponse.json({ success: false, error: 'Không tìm thấy môn cần xóa' }, { status: 404 })
    }

    await pool
      .request()
      .input('id', sql.Int, id)
      .query(`DELETE FROM CHUYEN_MON_CUA_GV WHERE MaMon = @id`)

    await pool
      .request()
      .input('id', sql.Int, id)
      .query(`DELETE FROM MON WHERE MaMon = @id`)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting course via mssql:', error)
    return NextResponse.json({ success: false, error: 'Lỗi khi xóa môn học' }, { status: 500 })
  } finally {
    if (pool) {
      await pool.close()
    }
  }
}
