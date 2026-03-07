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
      SELECT MaKhu AS id,
             TenKhu AS name,
             MoTa AS description
      FROM KHU
      ORDER BY TenKhu ASC
    `)
    await pool.close()

    const mapped = result.recordset.map((row: any) => ({
      id: row.id,
      name: String(row.name || '').trim(),
      description: String(row.description || '').trim(),
    }))

    return NextResponse.json({ success: true, data: mapped })
  } catch (error) {
    console.error('Error fetching areas via mssql:', error)
    return NextResponse.json({ success: false, data: [], error: 'Lỗi khi tải danh sách khu' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const name = String(body.name || '').trim()
    const description = String(body.description || '').trim()

    if (!name) {
      return NextResponse.json({ success: false, error: 'Tên khu là bắt buộc' }, { status: 400 })
    }

    const pool = await sql.connect(dbConfig)

    const duplicate = await pool
      .request()
      .input('name', name)
      .query(`SELECT TOP 1 MaKhu FROM KHU WHERE TenKhu = @name`)

    if (duplicate.recordset.length > 0) {
      await pool.close()
      return NextResponse.json({ success: false, error: 'Tên khu đã tồn tại' }, { status: 400 })
    }

    const result = await pool
      .request()
      .input('name', name)
      .input('description', description)
      .query(`
        INSERT INTO KHU (TenKhu, MoTa)
        OUTPUT INSERTED.MaKhu AS id
        VALUES (@name, @description)
      `)

    await pool.close()

    return NextResponse.json({ success: true, data: { id: result.recordset?.[0]?.id, name, description } }, { status: 201 })
  } catch (error) {
    console.error('Error creating area via mssql:', error)
    return NextResponse.json({ success: false, error: 'Lỗi khi thêm khu' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  let pool: any
  try {
    const { searchParams } = new URL(request.url)
    const idParam = searchParams.get('id')
    const id = Number(idParam)

    if (!idParam || Number.isNaN(id) || id <= 0) {
      return NextResponse.json({ success: false, error: 'Mã khu không hợp lệ' }, { status: 400 })
    }

    pool = await sql.connect(dbConfig)

    const existing = await pool
      .request()
      .input('id', sql.Int, id)
      .query(`SELECT TOP 1 MaKhu FROM KHU WHERE MaKhu = @id`)

    if (existing.recordset.length === 0) {
      return NextResponse.json({ success: false, error: 'Không tìm thấy khu cần xóa' }, { status: 404 })
    }

    const roomStatusStats = await pool
      .request()
      .input('id', sql.Int, id)
      .query(`
        SELECT
          COUNT(1) AS totalRooms,
          SUM(CASE WHEN TrangThai = N'Không thể sử dụng' THEN 1 ELSE 0 END) AS unavailableRooms
        FROM PHONG
        WHERE MaKhu = @id
      `)

    const totalRooms = Number(roomStatusStats.recordset?.[0]?.totalRooms || 0)
    const unavailableRooms = Number(roomStatusStats.recordset?.[0]?.unavailableRooms || 0)

    if (totalRooms > 0 && unavailableRooms !== totalRooms) {
      return NextResponse.json(
        {
          success: false,
          error: 'Chỉ có thể xóa khu khi tất cả phòng trong khu đều ở trạng thái "Không thể sử dụng"',
        },
        { status: 400 }
      )
    }

    await pool
      .request()
      .input('id', sql.Int, id)
      .query(`DELETE FROM KHU WHERE MaKhu = @id`)

    return NextResponse.json({ success: true, message: 'Xóa khu thành công' })
  } catch (error) {
    console.error('Error deleting area via mssql:', error)
    return NextResponse.json({ success: false, error: 'Lỗi khi xóa khu' }, { status: 500 })
  } finally {
    if (pool) {
      await pool.close()
    }
  }
}
