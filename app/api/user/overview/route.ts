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

    pool = await new sql.ConnectionPool(dbConfig).connect()

    const profileResult = await pool
      .request()
      .input("maTK", session.maTK)
      .query(`
        SELECT TOP 1
          tk.MaTK,
          tk.TenTK,
          tk.EmailTK,
          gv.MaGV,
          gv.TenGV,
          k.TenKhoa
        FROM TAI_KHOAN tk
        LEFT JOIN GIANG_VIEN gv
          ON gv.MaGV = tk.MaGV OR gv.MaTK = tk.MaTK
        LEFT JOIN KHOA k
          ON gv.MaKhoa = k.MaKhoa
        WHERE tk.MaTK = @maTK
      `)

    const profile = profileResult.recordset?.[0]
    if (!profile) {
      return NextResponse.json({ success: false, error: "Không tìm thấy thông tin tài khoản" }, { status: 404 })
    }

    const maGV = String(profile.MaGV || "").trim()
    if (!maGV) {
      return NextResponse.json({
        success: true,
        data: {
          tenTK: String(profile.TenTK || "").trim(),
          emailTK: String(profile.EmailTK || "").trim(),
          maGV: "",
          tenGV: String(profile.TenGV || "").trim(),
          khoa: String(profile.TenKhoa || "").trim(),
          courses: [],
        },
      })
    }

    const coursesResult = await pool
      .request()
      .input("maGV", maGV)
      .query(`
        SELECT DISTINCT
          m.MaMon,
          m.TenMon,
          m.LoaiMon,
          m.SoTinChi,
          n.TenNganh
        FROM CHUYEN_MON_CUA_GV cm
        INNER JOIN MON m ON m.MaMon = cm.MaMon
        LEFT JOIN NGANH n ON n.MaNganh = m.MaNganh
        WHERE cm.MaGV = @maGV
        ORDER BY m.TenMon ASC
      `)

    const courses = (coursesResult.recordset || []).map((row: any) => ({
      maMon: String(row.MaMon || "").trim(),
      tenMon: String(row.TenMon || "").trim(),
      loaiMon: String(row.LoaiMon || "").trim(),
      soTinChi: Number(row.SoTinChi || 0),
      tenNganh: String(row.TenNganh || "").trim(),
    }))

    return NextResponse.json({
      success: true,
      data: {
        tenTK: String(profile.TenTK || "").trim(),
        emailTK: String(profile.EmailTK || "").trim(),
        maGV,
        tenGV: String(profile.TenGV || "").trim(),
        khoa: String(profile.TenKhoa || "").trim(),
        courses,
      },
    })
  } catch (error) {
    console.error("Error fetching user overview:", error)
    return NextResponse.json({ success: false, error: "Lỗi khi tải tổng quan cá nhân" }, { status: 500 })
  } finally {
    if (pool) await pool.close()
  }
}
