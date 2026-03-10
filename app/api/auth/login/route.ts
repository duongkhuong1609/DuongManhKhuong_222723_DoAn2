import { NextResponse } from "next/server"
import { createHash } from "crypto"
import { encodeSession, SESSION_COOKIE_NAME } from "@/lib/auth-session"
import type { AuthRole } from "@/lib/auth-session"
const sql = require("mssql")

const dbConfig = {
  server: "localhost",
  instanceName: "SQLEXPRESS",
  database: "LAP_LICH_TU_DONG",
  authentication: { type: "default", options: { userName: "sa", password: "123456" } },
  options: { encrypt: false, trustServerCertificate: true },
}

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex")

const normalizeHash = (value: string) => String(value || "").trim().toLowerCase()

export async function POST(request: Request) {
  let pool: any
  try {
    const body = await request.json()
    const username = String(body.username || "").trim()
    const password = String(body.password || "")

    if (!username || !password) {
      return NextResponse.json({ success: false, error: "Thiếu tài khoản hoặc mật khẩu" }, { status: 400 })
    }

    pool = await new sql.ConnectionPool(dbConfig).connect()

    const accountResult = await pool
      .request()
      .input("username", username)
      .query(`
        SELECT TOP 1
          tk.MaTK,
          tk.TenTK,
          tk.EmailTK,
          tk.MatKhau,
          tk.Quyen,
          tk.MaGV,
          gv.MaGV AS instructorCode,
          gv.TenGV AS instructorName,
          gv.EmailGV AS instructorEmail,
          k.TenKhoa AS department
        FROM TAI_KHOAN tk
        LEFT JOIN GIANG_VIEN gv
          ON gv.MaGV = tk.MaGV OR gv.MaTK = tk.MaTK
        LEFT JOIN KHOA k
          ON gv.MaKhoa = k.MaKhoa
        WHERE tk.TenTK = @username OR tk.EmailTK = @username
      `)

    const account = accountResult.recordset?.[0]
    if (!account) {
      return NextResponse.json({ success: false, error: "Tài khoản hoặc mật khẩu không đúng" }, { status: 401 })
    }

    const inputHash = normalizeHash(sha256(password))
    const dbHash = normalizeHash(String(account.MatKhau || ""))

    if (!dbHash || inputHash !== dbHash) {
      return NextResponse.json({ success: false, error: "Tài khoản hoặc mật khẩu không đúng" }, { status: 401 })
    }

    const role: AuthRole = String(account.Quyen || "user").trim().toLowerCase() === "admin" ? "admin" : "user"

    const session = {
      maTK: String(account.MaTK || "").trim(),
      tenTK: String(account.TenTK || "").trim(),
      emailTK: String(account.EmailTK || "").trim(),
      role,
      maGV: String(account.instructorCode || account.MaGV || "").trim(),
      tenGV: String(account.instructorName || "").trim(),
      emailGV: String(account.instructorEmail || "").trim(),
      khoa: String(account.department || "").trim(),
    }

    const response = NextResponse.json({ success: true, data: session })
    response.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: encodeSession(session),
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    })

    return response
  } catch (error) {
    console.error("Error login via mssql:", error)
    return NextResponse.json({ success: false, error: "Lỗi khi đăng nhập" }, { status: 500 })
  } finally {
    if (pool) await pool.close()
  }
}
