import { NextResponse } from "next/server"
import { createHash, randomInt } from "crypto"
import { sendPasswordResetCodeEmail, sendPasswordResetSuccessEmail } from "@/lib/credential-email"

const sql = require("mssql")

const dbConfig = {
  server: "localhost",
  instanceName: "SQLEXPRESS",
  database: "LAP_LICH_TU_DONG",
  authentication: { type: "default", options: { userName: "sa", password: "123456" } },
  options: { encrypt: false, trustServerCertificate: true },
}

const CODE_EXPIRES_MINUTES = 10
const MAX_VERIFY_ATTEMPTS = 5

type ResetCodeRecord = {
  accountId: string
  email: string
  displayName: string
  notifyEmail: string
  codeHash: string
  expiresAt: number
  attempts: number
}

type GlobalResetCodeStore = typeof globalThis & {
  __passwordResetCodes?: Map<string, ResetCodeRecord>
}

const globalResetCodeStore = globalThis as GlobalResetCodeStore
if (!globalResetCodeStore.__passwordResetCodes) {
  globalResetCodeStore.__passwordResetCodes = new Map<string, ResetCodeRecord>()
}
const resetCodes = globalResetCodeStore.__passwordResetCodes

const normalizeEmail = (value: unknown) => String(value || "").trim().toLowerCase()
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex")
const generateCode = () => String(randomInt(100000, 1000000))

const cleanupExpiredCodes = () => {
  const now = Date.now()
  for (const [key, record] of resetCodes.entries()) {
    if (record.expiresAt <= now) {
      resetCodes.delete(key)
    }
  }
}

const isValidPassword = (password: string) => {
  if (password.length < 6) return false
  return true
}

export async function POST(request: Request) {
  let pool: any
  try {
    cleanupExpiredCodes()

    const body = await request.json()
    const action = String(body.action || "").trim().toLowerCase()

    if (action === "request-code") {
      const email = normalizeEmail(body.email)
      if (!email) {
        return NextResponse.json({ success: false, error: "Vui lòng nhập email" }, { status: 400 })
      }

      pool = await new sql.ConnectionPool(dbConfig).connect()
      const accountResult = await pool
        .request()
        .input("email", email)
        .query(`
          SELECT TOP 1
            tk.MaTK,
            tk.EmailTK,
            tk.TenTK,
            gv.TenGV,
            gv.EmailGV
          FROM TAI_KHOAN tk
          LEFT JOIN GIANG_VIEN gv ON gv.MaGV = tk.MaGV OR gv.MaTK = tk.MaTK
          WHERE LOWER(LTRIM(RTRIM(ISNULL(tk.EmailTK, '')))) = @email
        `)

      const account = accountResult.recordset?.[0]
      if (!account) {
        return NextResponse.json({ success: false, error: "Email không tồn tại trong hệ thống" }, { status: 404 })
      }

      const verificationCode = generateCode()
      const now = Date.now()
      resetCodes.set(email, {
        accountId: String(account.MaTK || "").trim(),
        email,
        displayName: String(account.TenGV || account.TenTK || email).trim(),
        notifyEmail: normalizeEmail(account.EmailGV || account.EmailTK || email),
        codeHash: sha256(verificationCode),
        expiresAt: now + CODE_EXPIRES_MINUTES * 60 * 1000,
        attempts: 0,
      })

      const mailResult = await sendPasswordResetCodeEmail({
        recipientEmail: email,
        displayName: String(account.TenGV || account.TenTK || email).trim(),
        verificationCode,
        expiresMinutes: CODE_EXPIRES_MINUTES,
      })

      if (!mailResult.sent) {
        resetCodes.delete(email)
        return NextResponse.json(
          { success: false, error: `Không gửi được mã xác minh: ${mailResult.reason || "Lỗi SMTP"}` },
          { status: 500 },
        )
      }

      return NextResponse.json({ success: true, message: "Đã gửi mã xác minh qua email" })
    }

    if (action === "reset-password") {
      const email = normalizeEmail(body.email)
      const code = String(body.code || "").trim()
      const newPassword = String(body.newPassword || "")

      if (!email || !code || !newPassword) {
        return NextResponse.json({ success: false, error: "Thiếu thông tin đặt lại mật khẩu" }, { status: 400 })
      }

      if (!isValidPassword(newPassword)) {
        return NextResponse.json({ success: false, error: "Mật khẩu mới phải có ít nhất 6 ký tự" }, { status: 400 })
      }

      const record = resetCodes.get(email)
      if (!record) {
        return NextResponse.json({ success: false, error: "Mã xác minh không tồn tại hoặc đã hết hạn" }, { status: 400 })
      }

      if (record.expiresAt <= Date.now()) {
        resetCodes.delete(email)
        return NextResponse.json({ success: false, error: "Mã xác minh đã hết hạn" }, { status: 400 })
      }

      if (record.attempts >= MAX_VERIFY_ATTEMPTS) {
        resetCodes.delete(email)
        return NextResponse.json({ success: false, error: "Bạn đã nhập sai mã quá số lần cho phép" }, { status: 400 })
      }

      const inputCodeHash = sha256(code)
      if (inputCodeHash !== record.codeHash) {
        record.attempts += 1
        resetCodes.set(email, record)
        const remaining = Math.max(0, MAX_VERIFY_ATTEMPTS - record.attempts)
        return NextResponse.json(
          { success: false, error: `Mã xác minh không đúng. Còn ${remaining} lần thử.` },
          { status: 400 },
        )
      }

      pool = await new sql.ConnectionPool(dbConfig).connect()
      const updateResult = await pool
        .request()
        .input("accountId", record.accountId)
        .input("hashedPassword", sha256(newPassword))
        .query(`
          UPDATE TAI_KHOAN
          SET MatKhau = @hashedPassword
          WHERE CAST(MaTK AS NVARCHAR(50)) = @accountId
        `)

      if (!updateResult.rowsAffected || updateResult.rowsAffected[0] <= 0) {
        return NextResponse.json({ success: false, error: "Không cập nhật được mật khẩu" }, { status: 500 })
      }

      resetCodes.delete(email)

      const notifyResult = await sendPasswordResetSuccessEmail({
        recipientEmail: record.notifyEmail || record.email,
        displayName: record.displayName,
      })

      return NextResponse.json({
        success: true,
        message: notifyResult.sent
          ? "Đổi mật khẩu thành công. Đã gửi thông báo qua email."
          : "Đổi mật khẩu thành công nhưng không gửi được email thông báo.",
      })
    }

    return NextResponse.json({ success: false, error: "Hành động không hợp lệ" }, { status: 400 })
  } catch (error) {
    console.error("Error forgot password:", error)
    return NextResponse.json({ success: false, error: "Lỗi khi xử lý quên mật khẩu" }, { status: 500 })
  } finally {
    if (pool) {
      await pool.close()
    }
  }
}
