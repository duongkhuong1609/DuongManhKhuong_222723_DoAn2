import { NextRequest, NextResponse } from "next/server"
import { decodeSession, SESSION_COOKIE_NAME } from "@/lib/auth-session"

const sql = require("mssql")

const dbConfig = {
  server: "localhost",
  instanceName: "SQLEXPRESS",
  database: "LAP_LICH_TU_DONG",
  authentication: { type: "default", options: { userName: "sa", password: "123456" } },
  options: { encrypt: false, trustServerCertificate: true },
}

export async function GET(request: NextRequest) {
  let pool: any
  try {
    const rawSession = request.cookies.get(SESSION_COOKIE_NAME)?.value
    const session = decodeSession(rawSession)

    if (!session) {
      return NextResponse.json({ success: false, error: "Chưa đăng nhập" }, { status: 401 })
    }

    if (!session.maGV) {
      return NextResponse.json({ success: true, data: { schedules: [], summary: { totalRows: 0, totalPeriods: 0 } } })
    }

    pool = await new sql.ConnectionPool(dbConfig).connect()

    const result = await pool
      .request()
      .input("maGV", session.maGV)
      .query(`
        SELECT
          ld.MaLD,
          ld.NgayDay,
          ld.SoTietDay,
          ld.TrangThai,
          ld.HocKyDay,
          ld.Buoi,
          lop.MaLop,
          lop.TenLop,
          mon.MaMon,
          mon.TenMon,
          phong.MaPhong,
          phong.TenPhong
        FROM LICH_DAY ld
        LEFT JOIN LOP lop ON lop.MaLop = ld.MaLop
        LEFT JOIN MON mon ON mon.MaMon = ld.MaMon
        LEFT JOIN PHONG phong ON phong.MaPhong = ld.MaPhong
        WHERE ld.MaGV = @maGV
        ORDER BY ld.NgayDay DESC, ld.MaLD DESC
      `)

    const schedules = (result.recordset || []).map((row: any) => ({
      maLD: String(row.MaLD || "").trim(),
      ngayDay: row.NgayDay,
      soTietDay: Number(row.SoTietDay || 0),
      trangThai: String(row.TrangThai || "").trim(),
      hocKyDay: String(row.HocKyDay || "").trim(),
      buoi: String(row.Buoi || "").trim(),
      maLop: String(row.MaLop || "").trim(),
      tenLop: String(row.TenLop || "").trim(),
      maMon: String(row.MaMon || "").trim(),
      tenMon: String(row.TenMon || "").trim(),
      maPhong: String(row.MaPhong || "").trim(),
      tenPhong: String(row.TenPhong || "").trim(),
    }))

    const totalPeriods = schedules.reduce((sum: number, item: any) => sum + Number(item.soTietDay || 0), 0)

    return NextResponse.json({
      success: true,
      data: {
        schedules,
        summary: {
          totalRows: schedules.length,
          totalPeriods,
        },
      },
    })
  } catch (error) {
    console.error("Error fetching user teaching data:", error)
    return NextResponse.json({ success: false, error: "Lỗi khi tải lịch dạy cá nhân" }, { status: 500 })
  } finally {
    if (pool) await pool.close()
  }
}
