import { NextResponse } from "next/server"
const sql = require('mssql')

const dbConfig = {
  server: 'localhost',
  instanceName: 'SQLEXPRESS',
  database: 'LAP_LICH_TU_DONG',
  authentication: { type: 'default', options: { userName: 'sa', password: '123456' } },
  options: { encrypt: false, trustServerCertificate: true }
}

export async function GET() {
  try {
    const pool = await sql.connect(dbConfig)
    const result = await pool.request().query(`
      SELECT
        k.MaKhoa AS departmentId,
        k.TenKhoa AS departmentName,
        n.MaNganh AS majorId,
        n.TenNganh AS majorName,
        n.MaKhoa AS majorDepartmentId
      FROM KHOA k
      LEFT JOIN NGANH n ON n.MaKhoa = k.MaKhoa
      ORDER BY k.TenKhoa ASC, n.TenNganh ASC
    `)
    await pool.close()

    const departmentMap = new Map<string, { id: string; name: string }>()
    const majors: Array<{ id: string; name: string; departmentId: string }> = []

    for (const row of result.recordset) {
      const departmentId = String(row.departmentId || '').trim()
      const departmentName = String(row.departmentName || '').trim()
      if (departmentId && departmentName && !departmentMap.has(departmentId)) {
        departmentMap.set(departmentId, { id: departmentId, name: departmentName })
      }

      const majorId = String(row.majorId || '').trim()
      const majorName = String(row.majorName || '').trim()
      const majorDepartmentId = String(row.majorDepartmentId || '').trim()
      if (majorId && majorName && majorDepartmentId) {
        majors.push({ id: majorId, name: majorName, departmentId: majorDepartmentId })
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        departments: Array.from(departmentMap.values()),
        majors,
      },
    })
  } catch (error) {
    console.error('Error fetching class options via mssql:', error)
    return NextResponse.json(
      { success: false, data: { departments: [], majors: [] }, error: 'Lỗi khi tải dữ liệu khoa/ngành' },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  let pool: any
  try {
    const body = await request.json()
    const action = String(body.action || '').trim()

    if (!action) {
      return NextResponse.json({ success: false, error: 'Thiếu hành động xử lý' }, { status: 400 })
    }

    pool = await sql.connect(dbConfig)

    if (action === 'createDepartment') {
      const departmentName = String(body.departmentName || '').trim()
      if (!departmentName) {
        return NextResponse.json({ success: false, error: 'Tên khoa là bắt buộc' }, { status: 400 })
      }

      const duplicateDepartment = await pool
        .request()
        .input('departmentName', departmentName)
        .query(`SELECT TOP 1 MaKhoa FROM KHOA WHERE TenKhoa = @departmentName`)

      if (duplicateDepartment.recordset.length > 0) {
        return NextResponse.json({ success: false, error: 'Khoa đã tồn tại' }, { status: 400 })
      }

      const insertedDepartment = await pool
        .request()
        .input('departmentName', departmentName)
        .query(`
          INSERT INTO KHOA (TenKhoa)
          OUTPUT INSERTED.MaKhoa AS id
          VALUES (@departmentName)
        `)

      return NextResponse.json({
        success: true,
        data: { id: String(insertedDepartment.recordset?.[0]?.id || ''), name: departmentName },
      }, { status: 201 })
    }

    if (action === 'createMajor') {
      const departmentId = String(body.departmentId || '').trim()
      const majorName = String(body.majorName || '').trim()

      if (!departmentId || !majorName) {
        return NextResponse.json({ success: false, error: 'Thiếu khoa hoặc tên ngành' }, { status: 400 })
      }

      const departmentExists = await pool
        .request()
        .input('departmentId', departmentId)
        .query(`SELECT TOP 1 MaKhoa FROM KHOA WHERE MaKhoa = @departmentId`)

      if (departmentExists.recordset.length === 0) {
        return NextResponse.json({ success: false, error: 'Không tìm thấy khoa đã chọn' }, { status: 400 })
      }

      const duplicateMajor = await pool
        .request()
        .input('majorName', majorName)
        .query(`SELECT TOP 1 MaNganh FROM NGANH WHERE TenNganh = @majorName`)

      if (duplicateMajor.recordset.length > 0) {
        return NextResponse.json({ success: false, error: 'Ngành đã tồn tại' }, { status: 400 })
      }

      const insertedMajor = await pool
        .request()
        .input('departmentId', departmentId)
        .input('majorName', majorName)
        .query(`
          INSERT INTO NGANH (MaKhoa, TenNganh)
          OUTPUT INSERTED.MaNganh AS id
          VALUES (@departmentId, @majorName)
        `)

      return NextResponse.json({
        success: true,
        data: {
          id: String(insertedMajor.recordset?.[0]?.id || ''),
          name: majorName,
          departmentId,
        },
      }, { status: 201 })
    }

    return NextResponse.json({ success: false, error: 'Hành động không hợp lệ' }, { status: 400 })
  } catch (error) {
    console.error('Error creating class option via mssql:', error)
    return NextResponse.json({ success: false, error: 'Lỗi khi thêm khoa/ngành' }, { status: 500 })
  } finally {
    if (pool) {
      await pool.close()
    }
  }
}
