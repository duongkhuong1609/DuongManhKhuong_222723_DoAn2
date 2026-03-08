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
        l.Nam AS year,
        l.NienKhoa AS nienKhoa,
        l.TrangThai AS status
      FROM LOP l
      LEFT JOIN NGANH n ON l.MaNganh = n.MaNganh
      LEFT JOIN KHOA k ON n.MaKhoa = k.MaKhoa
      ORDER BY l.TenLop ASC
    `)
    await pool.close()

    const currentYear = new Date().getFullYear()

    const mapped = result.recordset.map((row: any) => {
      const nienKhoa = String(row.nienKhoa || '').trim()
      const startYear = Number((nienKhoa.split('-')[0] || '').trim())
      const fallbackYear = Number.isNaN(startYear)
        ? 1
        : Math.max(1, Math.min(4, currentYear - startYear))

      const parsedYear = Number(row.year)
      const year = Number.isNaN(parsedYear) || parsedYear <= 0 ? fallbackYear : parsedYear

      return {
        id: row.id,
        name: String(row.name || '').trim(),
        major: String(row.major || '').trim(),
        department: String(row.department || '').trim(),
        year,
        nienKhoa,
        status: String(row.status || '').trim(),
      }
    })

    return NextResponse.json({ success: true, data: mapped })
  } catch (error) {
    console.error("Error fetching classes via mssql:", error)
    return NextResponse.json({ success: false, data: [], error: "Lỗi khi tải danh sách lớp học" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  let pool: any
  try {
    const body = await request.json()
    const maNganh = String(body.maNganh || '').trim()
    const tenLop = String(body.tenLop || '').trim()
    const nienKhoa = String(body.nienKhoa || '').trim()
    const nam = Number(body.nam)
    const trangThai = String(body.trangThai || 'Chưa tốt nghiệp').trim() || 'Chưa tốt nghiệp'

    if (!maNganh || !tenLop || !nienKhoa || Number.isNaN(nam)) {
      return NextResponse.json({ success: false, error: 'Thiếu thông tin bắt buộc' }, { status: 400 })
    }

    if (nam < 1 || nam > 4) {
      return NextResponse.json({ success: false, error: 'Năm lớp phải trong khoảng từ 1 đến 4' }, { status: 400 })
    }

    pool = await sql.connect(dbConfig)

    const majorExists = await pool
      .request()
      .input('maNganh', maNganh)
      .query(`SELECT TOP 1 MaNganh FROM NGANH WHERE MaNganh = @maNganh`)

    if (majorExists.recordset.length === 0) {
      return NextResponse.json({ success: false, error: 'Không tìm thấy ngành đã chọn' }, { status: 400 })
    }

    const duplicateClass = await pool
      .request()
      .input('tenLop', tenLop)
      .query(`SELECT TOP 1 MaLop FROM LOP WHERE TenLop = @tenLop`)

    if (duplicateClass.recordset.length > 0) {
      return NextResponse.json({ success: false, error: 'Tên lớp đã tồn tại' }, { status: 400 })
    }

    await pool
      .request()
      .input('maNganh', maNganh)
      .input('tenLop', tenLop)
      .input('nam', nam)
      .input('nienKhoa', nienKhoa)
      .input('trangThai', trangThai)
      .query(`
        INSERT INTO LOP (MaNganh, TenLop, Nam, NienKhoa, TrangThai)
        VALUES (@maNganh, @tenLop, @nam, @nienKhoa, @trangThai)
      `)

    return NextResponse.json({ success: true }, { status: 201 })
  } catch (error) {
    console.error('Error creating class via mssql:', error)
    return NextResponse.json({ success: false, error: 'Lỗi khi thêm lớp học' }, { status: 500 })
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
    const action = String(body.action || '').trim()

    if (action === 'updateAcademicYear') {
      const currentYear = new Date().getFullYear()
      const academicYearStart = Number(body.academicYearStart)

      if (Number.isNaN(academicYearStart)) {
        return NextResponse.json({ success: false, error: 'Năm học không hợp lệ' }, { status: 400 })
      }

      const allowedAcademicYears = [currentYear - 1, currentYear]
      if (!allowedAcademicYears.includes(academicYearStart)) {
        return NextResponse.json(
          { success: false, error: 'Chỉ được chọn năm học hiện tại hoặc năm học kế trước' },
          { status: 400 }
        )
      }

      pool = await sql.connect(dbConfig)

      await pool
        .request()
        .input('academicYearStart', sql.Int, academicYearStart)
        .query(`
          WITH ClassBase AS (
            SELECT
              MaLop,
              TRY_CAST(LEFT(NienKhoa, CHARINDEX('-', NienKhoa + '-') - 1) AS INT) AS StartYear
            FROM LOP
          )
          UPDATE l
          SET
            Nam = CASE
              WHEN (@academicYearStart - cb.StartYear + 1) < 1 THEN 1
              WHEN (@academicYearStart - cb.StartYear + 1) > 4 THEN 4
              ELSE (@academicYearStart - cb.StartYear + 1)
            END,
            TrangThai = CASE
              WHEN (@academicYearStart - cb.StartYear + 1) > 4 THEN N'Đã tốt nghiệp'
              ELSE N'Chưa tốt nghiệp'
            END
          FROM LOP l
          INNER JOIN ClassBase cb ON cb.MaLop = l.MaLop
          WHERE cb.StartYear IS NOT NULL
        `)

      return NextResponse.json({ success: true })
    }

    const id = Number(body.id)
    const maNganh = String(body.maNganh || '').trim()
    const tenLop = String(body.tenLop || '').trim()
    const nienKhoa = String(body.nienKhoa || '').trim()
    const nam = Number(body.nam)
    const trangThai = String(body.trangThai || '').trim()

    if (Number.isNaN(id) || id <= 0 || !maNganh || !tenLop || !nienKhoa || Number.isNaN(nam) || !trangThai) {
      return NextResponse.json({ success: false, error: 'Thiếu thông tin bắt buộc' }, { status: 400 })
    }

    if (nam < 1 || nam > 4) {
      return NextResponse.json({ success: false, error: 'Năm lớp phải trong khoảng từ 1 đến 4' }, { status: 400 })
    }

    pool = await sql.connect(dbConfig)

    const classExists = await pool
      .request()
      .input('id', sql.Int, id)
      .query(`SELECT TOP 1 MaLop FROM LOP WHERE MaLop = @id`)

    if (classExists.recordset.length === 0) {
      return NextResponse.json({ success: false, error: 'Không tìm thấy lớp cần cập nhật' }, { status: 404 })
    }

    const majorExists = await pool
      .request()
      .input('maNganh', maNganh)
      .query(`SELECT TOP 1 MaNganh FROM NGANH WHERE MaNganh = @maNganh`)

    if (majorExists.recordset.length === 0) {
      return NextResponse.json({ success: false, error: 'Không tìm thấy ngành đã chọn' }, { status: 400 })
    }

    const duplicateClass = await pool
      .request()
      .input('tenLop', tenLop)
      .input('id', sql.Int, id)
      .query(`SELECT TOP 1 MaLop FROM LOP WHERE TenLop = @tenLop AND MaLop <> @id`)

    if (duplicateClass.recordset.length > 0) {
      return NextResponse.json({ success: false, error: 'Tên lớp đã tồn tại' }, { status: 400 })
    }

    await pool
      .request()
      .input('id', sql.Int, id)
      .input('maNganh', maNganh)
      .input('tenLop', tenLop)
      .input('nam', nam)
      .input('nienKhoa', nienKhoa)
      .input('trangThai', trangThai)
      .query(`
        UPDATE LOP
        SET MaNganh = @maNganh,
            TenLop = @tenLop,
            Nam = @nam,
            NienKhoa = @nienKhoa,
            TrangThai = @trangThai
        WHERE MaLop = @id
      `)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error updating class via mssql:', error)
    return NextResponse.json({ success: false, error: 'Lỗi khi cập nhật lớp học' }, { status: 500 })
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
      return NextResponse.json({ success: false, error: 'Mã lớp không hợp lệ' }, { status: 400 })
    }

    pool = await sql.connect(dbConfig)

    const classExists = await pool
      .request()
      .input('id', sql.Int, id)
      .query(`SELECT TOP 1 MaLop FROM LOP WHERE MaLop = @id`)

    if (classExists.recordset.length === 0) {
      return NextResponse.json({ success: false, error: 'Không tìm thấy lớp cần xóa' }, { status: 404 })
    }

    await pool
      .request()
      .input('id', sql.Int, id)
      .query(`DELETE FROM LOP WHERE MaLop = @id`)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting class via mssql:', error)
    return NextResponse.json({ success: false, error: 'Lỗi khi xóa lớp học' }, { status: 500 })
  } finally {
    if (pool) {
      await pool.close()
    }
  }
}
