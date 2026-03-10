import { NextResponse } from "next/server"
import { getAuthSession } from "@/lib/auth-session"
const sql = require("mssql")

const dbConfig = {
  server: "localhost",
  instanceName: "SQLEXPRESS",
  database: "LAP_LICH_TU_DONG",
  authentication: { type: "default", options: { userName: "sa", password: "123456" } },
  options: { encrypt: false, trustServerCertificate: true },
}

export async function GET() {
  let pool: any
  const session = await getAuthSession()
  if (!session) {
    return NextResponse.json({ success: false, error: "Chưa đăng nhập" }, { status: 401 })
  }

  if (session.emailTK) {
    return NextResponse.json({ success: true, data: session })
  }

  try {
    pool = await new sql.ConnectionPool(dbConfig).connect()
    const result = await pool
      .request()
      .input("maTK", session.maTK)
      .query(`
        SELECT TOP 1 EmailTK
        FROM TAI_KHOAN
        WHERE MaTK = @maTK
      `)

    const emailTK = String(result.recordset?.[0]?.EmailTK || "").trim()

    return NextResponse.json({
      success: true,
      data: {
        ...session,
        emailTK,
      },
    })
  } catch (error) {
    console.error("Error hydrating emailTK in auth/me:", error)
    return NextResponse.json({ success: true, data: session })
  } finally {
    if (pool) await pool.close()
  }
}
