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

const resolveWeekNumber = (raw: unknown) => {
  const text = String(raw || "").trim().toLowerCase()
  const parsed = Number((text.match(/\d+/) || [0])[0])
  if (Number.isFinite(parsed) && parsed > 0) return parsed
  return 1
}

const mapDayToCell = (dateValue: unknown) => {
  const date = new Date(String(dateValue || ""))
  if (Number.isNaN(date.getTime())) return null
  const day = date.getDay()
  if (day === 0 || day === 1) return null
  return day - 2
}

const resolveSlot = (session: string) => {
  const value = String(session || "").trim().toLowerCase()
  if (value.includes("sáng") || value.includes("sang") || value.includes("morning")) return 1
  if (value.includes("chiều") || value.includes("chieu") || value.includes("afternoon")) return 3
  if (value.includes("tối") || value.includes("toi") || value.includes("evening")) return 5
  return 1
}

export async function GET(request: NextRequest) {
  let pool: any
  try {
    const rawSession = request.cookies.get(SESSION_COOKIE_NAME)?.value
    const session = decodeSession(rawSession)

    if (!session) {
      return NextResponse.json({ success: false, error: "Chưa đăng nhập" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const semester = String(searchParams.get("semester") || "all").trim()
    const week = Number(searchParams.get("week") || 1)
    const requestedInstructor = String(searchParams.get("instructor") || "all").trim()

    pool = await new sql.ConnectionPool(dbConfig).connect()

    const instructorFilter =
      session.role === "user"
        ? String(session.maGV || "").trim()
        : requestedInstructor !== "all"
          ? requestedInstructor
          : ""

    const whereConditions: string[] = [
      `UPPER(LTRIM(RTRIM(ISNULL(CAST(ld.TrangThai AS NVARCHAR(50)), '')))) NOT IN (N'ĐÃ XÓA', N'DA XOA', N'DELETED', N'HỦY', N'HUY', N'CANCELLED', N'CANCELED')`,
    ]

    const dbRequest = pool.request()

    if (semester !== "all") {
      whereConditions.push("LTRIM(RTRIM(ISNULL(CAST(ld.HocKyDay AS NVARCHAR(50)), ''))) = @semester")
      dbRequest.input("semester", semester)
    }

    if (instructorFilter) {
      whereConditions.push("CAST(ld.MaGV AS NVARCHAR(50)) = @instructor")
      dbRequest.input("instructor", instructorFilter)
    }

    const whereSql = whereConditions.length ? `WHERE ${whereConditions.join(" AND ")}` : ""

    const result = await dbRequest.query(`
      SELECT
        ld.MaLD,
        ld.MaLop,
        lop.TenLop,
        ld.MaMon,
        mon.TenMon,
        ld.MaGV,
        gv.TenGV,
        ld.MaPhong,
        phong.TenPhong,
        ld.NgayDay,
        ld.Buoi,
        ld.SoTietDay,
        ld.HocKyDay,
        ld.Tuan
      FROM LICH_DAY ld
      LEFT JOIN LOP lop ON lop.MaLop = ld.MaLop
      LEFT JOIN MON mon ON mon.MaMon = ld.MaMon
      LEFT JOIN GIANG_VIEN gv ON gv.MaGV = ld.MaGV
      LEFT JOIN PHONG phong ON phong.MaPhong = ld.MaPhong
      ${whereSql}
      ORDER BY ld.NgayDay ASC, ld.MaLD ASC
    `)

    const rows = result.recordset || []

    const mappedSchedule = rows
      .map((row: any) => {
        const rowWeek = resolveWeekNumber(row.Tuan)
        if (rowWeek !== week) return null

        const day = mapDayToCell(row.NgayDay)
        if (day === null) return null

        const slot = resolveSlot(String(row.Buoi || ""))

        return {
          id: String(row.MaLD || "").trim(),
          day,
          slot,
          course: String(row.TenMon || `Môn ${row.MaMon}`).trim(),
          class: String(row.TenLop || `Lớp ${row.MaLop}`).trim(),
          instructor: String(row.TenGV || `GV ${row.MaGV}`).trim(),
          room: String(row.TenPhong || `P${row.MaPhong}`).trim(),
          semester: String(row.HocKyDay || "").trim(),
          raw: {
            maMon: row.MaMon,
            maLop: row.MaLop,
            maGV: row.MaGV,
            maPhong: row.MaPhong,
            buoi: String(row.Buoi || "").trim(),
            soTietDay: Number(row.SoTietDay || 0),
            ngayDay: row.NgayDay,
          },
        }
      })
      .filter(Boolean)

    const allSemestersResult = await pool.request().query(`
      SELECT DISTINCT LTRIM(RTRIM(ISNULL(CAST(HocKyDay AS NVARCHAR(50)), ''))) AS HocKyDay
      FROM LICH_DAY
      WHERE ISNULL(CAST(HocKyDay AS NVARCHAR(50)), '') <> ''
      ORDER BY HocKyDay
    `)

    const semesters = (allSemestersResult.recordset || [])
      .map((row: any) => String(row.HocKyDay || "").trim())
      .filter(Boolean)

    const instructors = session.role === "user"
      ? [{ id: String(session.maGV || "").trim(), name: String(session.tenGV || "Giảng viên").trim() }]
      : Array.from(
          new Map(
            rows
              .map((row: any): [string, string] => [String(row.MaGV || "").trim(), String(row.TenGV || "").trim()])
              .filter(([id, name]: [string, string]) => id && name)
          ).entries()
        ).map(([id, name]) => ({ id, name }))

    return NextResponse.json({
      success: true,
      data: {
        schedule: mappedSchedule,
        filters: {
          semesters,
          instructors,
          currentWeek: Number.isFinite(week) && week > 0 ? week : 1,
        },
      },
    })
  } catch (error) {
    console.error("Error fetching timetable:", error)
    return NextResponse.json({ success: false, error: "Lỗi khi tải thời khóa biểu" }, { status: 500 })
  } finally {
    if (pool) await pool.close()
  }
}
