import { NextRequest, NextResponse } from "next/server"
import { MSSQL_DB_CONFIG } from "@/lib/db-config"

const sql = require("mssql")

const dbConfig = MSSQL_DB_CONFIG

export async function GET(request: NextRequest) {
  let pool: any
  try {
    const { searchParams } = new URL(request.url)
    const department = String(searchParams.get("department") || "").trim()
    const majorId = String(searchParams.get("majorId") || "").trim()

    pool = await sql.connect(dbConfig)

    const majorReq = pool.request()
    let majorWhere = ""
    if (department) {
      majorReq.input("department", department)
      majorWhere = "WHERE k.TenKhoa = @department"
    }

    const majorsResult = await majorReq.query(`
      SELECT
        CAST(n.MaNganh AS NVARCHAR(50)) AS id,
        n.TenNganh AS name,
        k.TenKhoa AS department
      FROM NGANH n
      INNER JOIN KHOA k ON k.MaKhoa = n.MaKhoa
      ${majorWhere}
      ORDER BY n.TenNganh ASC
    `)

    const courseReq = pool.request()
    const whereParts: string[] = []

    if (department) {
      whereParts.push("k.TenKhoa = @courseDepartment")
      courseReq.input("courseDepartment", department)
    }

    if (majorId) {
      whereParts.push("CAST(m.MaNganh AS NVARCHAR(50)) = @majorId")
      courseReq.input("majorId", majorId)
    }

    const whereSql = whereParts.length > 0 ? `WHERE ${whereParts.join(" AND ")}` : ""

    const coursesResult = await courseReq.query(`
      SELECT
        m.MaMon AS id,
        m.TenMon AS name,
        m.LoaiMon AS type,
        CAST(m.MaNganh AS NVARCHAR(50)) AS majorId,
        n.TenNganh AS majorName,
        TRY_CONVERT(INT, m.NamM) AS year,
        TRY_CONVERT(INT, m.HocKy) AS semester
      FROM MON m
      INNER JOIN NGANH n ON n.MaNganh = m.MaNganh
      INNER JOIN KHOA k ON k.MaKhoa = n.MaKhoa
      ${whereSql}
      ORDER BY n.TenNganh ASC, m.TenMon ASC
    `)

    const majors = (majorsResult.recordset || []).map((row: any) => ({
      id: String(row.id || "").trim(),
      name: String(row.name || "").trim(),
      department: String(row.department || "").trim(),
    }))

    const courses = (coursesResult.recordset || []).map((row: any) => ({
      id: Number(row.id || 0),
      name: String(row.name || "").trim(),
      type: String(row.type || "").trim(),
      majorId: String(row.majorId || "").trim(),
      majorName: String(row.majorName || "").trim(),
      year: Number(row.year || 0),
      semester: Number(row.semester || 0),
    }))

    return NextResponse.json({ success: true, data: { majors, courses } })
  } catch (error) {
    console.error("Error loading instructor course options:", error)
    return NextResponse.json({ success: false, error: "Lỗi khi tải danh sách môn theo ngành", data: { majors: [], courses: [] } }, { status: 500 })
  } finally {
    if (pool) {
      await pool.close()
    }
  }
}
