import { NextRequest, NextResponse } from "next/server"
import { MSSQL_DB_CONFIG } from "@/lib/db-config"
const sql = require("mssql")

const dbConfig = MSSQL_DB_CONFIG

const createDbPool = async () => {
  const pool = new sql.ConnectionPool(dbConfig)
  await pool.connect()
  return pool
}

const resolveLinkTable = async (pool: any) => {
  const result = await pool.request().query(`
    SELECT TABLE_NAME
    FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_NAME IN ('HOC_KY_CAC_MON_HOC', 'HOC_KY_CAC_MON')
  `)

  const names = result.recordset.map((row: any) => String(row.TABLE_NAME || "").trim())
  if (names.includes("HOC_KY_CAC_MON_HOC")) return "HOC_KY_CAC_MON_HOC"
  if (names.includes("HOC_KY_CAC_MON")) return "HOC_KY_CAC_MON"
  return ""
}

export async function GET(request: NextRequest) {
  let pool: any
  try {
    const { searchParams } = new URL(request.url)
    const semesterId = String(searchParams.get("semesterId") || "").trim()

    if (!semesterId) {
      return NextResponse.json({ success: false, error: "Thiếu mã học kỳ", data: [] }, { status: 400 })
    }

    pool = await createDbPool()
    const linkTable = await resolveLinkTable(pool)

    if (!linkTable) {
      return NextResponse.json({ success: true, data: [] })
    }

    const result = await pool
      .request()
      .input("semesterId", semesterId)
      .query(`
        SELECT
          m.MaMon AS id,
          m.TenMon AS name,
          m.LoaiMon AS type,
          TRY_CONVERT(INT, m.SoTinChi) AS credits,
          m.HocKy AS semester
        FROM ${linkTable} hkm
        INNER JOIN MON m ON hkm.MaMon = m.MaMon
        WHERE CAST(hkm.MaHK AS NVARCHAR(50)) = @semesterId
        ORDER BY m.TenMon ASC
      `)

    const data = result.recordset.map((row: any) => ({
      id: Number(row.id || 0),
      name: String(row.name || "").trim(),
      type: String(row.type || "").trim(),
      credits: Number(row.credits || 0),
      semester: String(row.semester || "").trim(),
    }))

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error("Error fetching semester courses via mssql:", error)
    return NextResponse.json({ success: false, error: "Lỗi khi tải danh sách môn trong học kỳ", data: [] }, { status: 500 })
  } finally {
    if (pool) {
      await pool.close()
    }
  }
}
