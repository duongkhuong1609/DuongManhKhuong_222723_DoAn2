import { NextResponse } from "next/server"
const sql = require("mssql")

const dbConfig = {
  server: "localhost",
  instanceName: "SQLEXPRESS",
  database: "LAP_LICH_TU_DONG",
  authentication: { type: "default", options: { userName: "sa", password: "123456" } },
  options: { encrypt: false, trustServerCertificate: true },
}

export async function GET() {
  try {
    const pool = await sql.connect(dbConfig)
    const result = await pool.request().query(`
      SELECT TenKhoa AS name
      FROM KHOA
      WHERE TenKhoa IS NOT NULL
      ORDER BY TenKhoa ASC
    `)
    await pool.close()

    const data = result.recordset.map((row: any) => String(row.name || "").trim()).filter(Boolean)
    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error("Error fetching departments via mssql:", error)
    return NextResponse.json({ success: true, data: [] })
  }
}
