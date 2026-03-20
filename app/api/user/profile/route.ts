import { NextRequest, NextResponse } from "next/server"
import { decodeSession, SESSION_COOKIE_NAME } from "@/lib/auth-session"
import { MSSQL_DB_CONFIG } from "@/lib/db-config"

const sql = require("mssql")

const dbConfig = MSSQL_DB_CONFIG

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
          tk.Quyen,
          gv.MaGV,
          gv.TenGV,
          gv.EmailGV,
          gv.ChucVu,
          gv.TrangThai,
          k.TenKhoa
        FROM TAI_KHOAN tk
        LEFT JOIN GIANG_VIEN gv
          ON gv.MaGV = tk.MaGV OR gv.MaTK = tk.MaTK
        LEFT JOIN KHOA k
          ON gv.MaKhoa = k.MaKhoa
        WHERE tk.MaTK = @maTK
      `)

    const row = profileResult.recordset?.[0]
    if (!row) {
      return NextResponse.json({ success: false, error: "Không tìm thấy thông tin tài khoản" }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      data: {
        maTK: String(row.MaTK || "").trim(),
        tenTK: String(row.TenTK || "").trim(),
        emailTK: String(row.EmailTK || "").trim(),
        quyen: String(row.Quyen || "").trim().toLowerCase(),
        maGV: String(row.MaGV || "").trim(),
        tenGV: String(row.TenGV || "").trim(),
        emailGV: String(row.EmailGV || "").trim(),
        chucVu: String(row.ChucVu || "").trim(),
        trangThai: String(row.TrangThai || "").trim(),
        khoa: String(row.TenKhoa || "").trim(),
      },
    })
  } catch (error) {
    console.error("Error fetching user profile:", error)
    return NextResponse.json({ success: false, error: "Lỗi khi tải thông tin cá nhân" }, { status: 500 })
  } finally {
    if (pool) await pool.close()
  }
}
