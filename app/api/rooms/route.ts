import { NextRequest, NextResponse } from "next/server"
import { MSSQL_DB_CONFIG } from "@/lib/db-config"
const sql = require('mssql')

const dbConfig = MSSQL_DB_CONFIG

export async function GET(request: NextRequest) {
  try {
    const pool = await sql.connect(dbConfig)
    const result = await pool.request().query(`
      SELECT ph.MaPhong AS id,
             ph.TenPhong AS roomName,
             kh.TenKhu AS building,
             ph.LoaiPhong AS type,
             ph.TrangThai AS status
      FROM PHONG ph
      LEFT JOIN KHU kh ON ph.MaKhu = kh.MaKhu
    `)
    await pool.close()

    const mapped = result.recordset.map((row: any) => ({
      id: row.id,
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
  try {
    const body = await request.json()
    const roomName = String(body.roomName || '').trim()
    const building = String(body.building || '').trim()
    const type = String(body.type || '').trim()
    const status = String(body.status || '').trim()

    if (!roomName || !building || !type || !status) {
      return NextResponse.json({ success: false, error: 'Thiếu thông tin bắt buộc' }, { status: 400 })
    }

    const pool = await sql.connect(dbConfig)

    const areaResult = await pool
      .request()
      .input('building', building)
      .query(`
        SELECT TOP 1 MaKhu
        FROM KHU
        WHERE TenKhu = @building
      `)

    if (!areaResult.recordset.length) {
      await pool.close()
      return NextResponse.json({ success: false, error: 'Không tìm thấy khu tương ứng' }, { status: 400 })
    }

    const maKhu = areaResult.recordset[0].MaKhu

    const duplicateResult = await pool
      .request()
      .input('roomName', roomName)
      .input('maKhu', maKhu)
      .query(`
        SELECT TOP 1 MaPhong
        FROM PHONG
        WHERE TenPhong = @roomName AND MaKhu = @maKhu
      `)

    if (duplicateResult.recordset.length > 0) {
      await pool.close()
      return NextResponse.json({ success: false, error: 'Phòng này đã tồn tại trong khu đã chọn' }, { status: 400 })
    }

    await pool
      .request()
      .input('maKhu', maKhu)
      .input('roomName', roomName)
      .input('type', type)
      .input('status', status)
      .query(`
        INSERT INTO PHONG (MaKhu, TenPhong, LoaiPhong, TrangThai)
        VALUES (@maKhu, @roomName, @type, @status)
      `)

    await pool.close()

    return NextResponse.json({ success: true }, { status: 201 })
  } catch (error) {
    console.error('Error creating room via mssql:', error)
    return NextResponse.json({ success: false, error: 'Lỗi khi thêm phòng học' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  let pool: any
  try {
    const body = await request.json()
    const roomId = Number(body.roomId)
    const status = String(body.status || '').trim()
    const scope = String(body.scope || 'room').trim().toLowerCase()

    if (Number.isNaN(roomId) || roomId <= 0) {
      return NextResponse.json({ success: false, error: 'Mã phòng không hợp lệ' }, { status: 400 })
    }

    if (!status) {
      return NextResponse.json({ success: false, error: 'Trạng thái là bắt buộc' }, { status: 400 })
    }

    if (scope !== 'room' && scope !== 'area') {
      return NextResponse.json({ success: false, error: 'Phạm vi cập nhật không hợp lệ' }, { status: 400 })
    }

    pool = await sql.connect(dbConfig)

    const exists = await pool
      .request()
      .input('roomId', sql.Int, roomId)
      .query(`SELECT TOP 1 MaPhong, MaKhu FROM PHONG WHERE MaPhong = @roomId`)

    if (exists.recordset.length === 0) {
      return NextResponse.json({ success: false, error: 'Không tìm thấy phòng cần cập nhật' }, { status: 404 })
    }

    if (scope === 'room') {
      await pool
        .request()
        .input('roomId', sql.Int, roomId)
        .input('status', status)
        .query(`UPDATE PHONG SET TrangThai = @status WHERE MaPhong = @roomId`)

      return NextResponse.json({ success: true, message: 'Cập nhật trạng thái phòng thành công' })
    }

    await pool
      .request()
      .input('roomId', sql.Int, roomId)
      .input('status', status)
      .query(`
        UPDATE PHONG
        SET TrangThai = @status
        WHERE MaKhu = (
          SELECT TOP 1 MaKhu
          FROM PHONG
          WHERE MaPhong = @roomId
        )
      `)

    return NextResponse.json({ success: true, message: 'Cập nhật trạng thái cho toàn bộ khu thành công' })
  } catch (error) {
    console.error('Error updating room status via mssql:', error)
    return NextResponse.json({ success: false, error: 'Lỗi khi cập nhật trạng thái phòng' }, { status: 500 })
  } finally {
    if (pool) {
      await pool.close()
    }
  }
}

export async function DELETE(request: NextRequest) {
  return NextResponse.json({ success: false, error: "Chức năng chưa được hỗ trợ" }, { status: 501 })
}
