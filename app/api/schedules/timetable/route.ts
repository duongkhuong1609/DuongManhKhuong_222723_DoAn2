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

const getWeekOfYear = (value: unknown) => {
  const date = new Date(String(value || ""))
  if (Number.isNaN(date.getTime())) return null

  const utcDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = utcDate.getUTCDay() || 7
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1))
  const week = Math.ceil((((utcDate.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
  return Number.isFinite(week) && week > 0 ? week : null
}

const buildWeeksFromDateRange = (startRaw: unknown, endRaw: unknown) => {
  const start = new Date(String(startRaw || ""))
  const end = new Date(String(endRaw || ""))
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return [] as number[]

  const values: number[] = []
  const cursor = new Date(start)
  cursor.setHours(0, 0, 0, 0)
  const finalDate = new Date(end)
  finalDate.setHours(23, 59, 59, 999)

  while (cursor <= finalDate) {
    const week = getWeekOfYear(cursor)
    if (week && !values.includes(week)) {
      values.push(week)
    }
    cursor.setDate(cursor.getDate() + 7)
  }

  return values.sort((a, b) => a - b)
}

const mapDayToCell = (dateValue: unknown) => {
  const date = new Date(String(dateValue || ""))
  if (Number.isNaN(date.getTime())) return null
  const day = date.getDay()
  if (day === 0) return null
  return day - 1
}

const resolveSlot = (session: string) => {
  const value = String(session || "").trim().toLowerCase()
  if (value.includes("1-3")) return 1
  if (value.includes("4-6")) return 2
  if (value.includes("1-5")) return 3
  if (value.includes("7-9")) return 4
  if (value.includes("10-12")) return 5
  if (value.includes("7-11")) return 6

  if (value.includes("sáng") || value.includes("sang") || value.includes("morning")) return 1
  if (value.includes("chiều") || value.includes("chieu") || value.includes("afternoon")) return 4
  if (value.includes("tối") || value.includes("toi") || value.includes("evening")) return 5
  return 1
}

const resolvePeriodRange = (session: string) => {
  const value = String(session || "").trim().toLowerCase()
  const matched = value.match(/(\d+)\s*-\s*(\d+)/)
  if (matched) {
    const start = Number(matched[1])
    const end = Number(matched[2])
    if (Number.isFinite(start) && Number.isFinite(end) && start >= 1 && end >= start) {
      return { start, end }
    }
  }

  const slot = resolveSlot(session)
  return { start: slot, end: slot }
}

const formatIsoDateLocal = (date: Date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
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
    const week = Number(searchParams.get("week") || 0)
    const requestedInstructor = String(searchParams.get("instructor") || "all").trim()
    const department = String(searchParams.get("department") || "all").trim()
    const major = String(searchParams.get("major") || "all").trim()
    const classId = String(searchParams.get("classId") || "all").trim()

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

    if (department !== "all") {
      whereConditions.push("CAST(k.MaKhoa AS NVARCHAR(50)) = @department")
      dbRequest.input("department", department)
    }

    if (major !== "all") {
      whereConditions.push("CAST(n.MaNganh AS NVARCHAR(50)) = @major")
      dbRequest.input("major", major)
    }

    if (classId !== "all") {
      whereConditions.push("CAST(ld.MaLop AS NVARCHAR(50)) = @classId")
      dbRequest.input("classId", classId)
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
        gv.EmailGV,
        ld.MaPhong,
        phong.TenPhong,
        ld.NgayDay,
        ld.Buoi,
        ld.SoTietDay,
        ld.HocKyDay,
        ld.Tuan,
        n.MaNganh,
        n.TenNganh,
        k.MaKhoa,
        k.TenKhoa
      FROM LICH_DAY ld
      LEFT JOIN LOP lop ON lop.MaLop = ld.MaLop
      LEFT JOIN MON mon ON mon.MaMon = ld.MaMon
      LEFT JOIN NGANH n ON n.MaNganh = lop.MaNganh
      LEFT JOIN KHOA k ON k.MaKhoa = n.MaKhoa
      LEFT JOIN GIANG_VIEN gv ON gv.MaGV = ld.MaGV
      LEFT JOIN PHONG phong ON phong.MaPhong = ld.MaPhong
      ${whereSql}
      ORDER BY ld.NgayDay ASC, ld.MaLD ASC
    `)

    const rows = result.recordset || []

    const weekSet = new Set<number>()
    for (const row of rows) {
      const value = getWeekOfYear(row.NgayDay)
      if (Number.isFinite(value) && (value || 0) > 0) {
        weekSet.add(Number(value))
      }
    }
    let weekOptions: number[] = Array.from(weekSet).sort((a, b) => a - b)

    const semesterNamesInRows = Array.from(
      new Set(
        rows
          .map((row: any) => String(row.HocKyDay || "").trim())
          .filter(Boolean)
      )
    )

    if (semesterNamesInRows.length > 0) {
      const rangeRequest = pool.request()
      const placeholders = semesterNamesInRows.map((_, index) => {
        rangeRequest.input(`hocKy${index}`, semesterNamesInRows[index])
        return `@hocKy${index}`
      })

      const semesterRangeResult = await rangeRequest.query(`
        SELECT TuNgay, DenNgay
        FROM HOC_KY
        WHERE LTRIM(RTRIM(ISNULL(CAST(TenHK AS NVARCHAR(50)), ''))) IN (${placeholders.join(",")})
      `)

      const fromSemesterDate: number[] = Array.from(
        new Set(
          (semesterRangeResult.recordset || []).flatMap((item: any) =>
            buildWeeksFromDateRange(item.TuNgay, item.DenNgay)
          )
        )
      ).filter((value: unknown): value is number => Number.isFinite(value)).sort((a, b) => a - b)

      if (fromSemesterDate.length > 0) {
        weekOptions = fromSemesterDate
      }
    }

    let effectiveWeek = week
    if (!Number.isFinite(effectiveWeek) || effectiveWeek <= 0) {
      effectiveWeek = weekOptions[0] || 1
    }

    if (weekOptions.length > 0 && !weekOptions.includes(effectiveWeek)) {
      effectiveWeek = weekOptions[0]
    }

    let weekDates: string[] = []
    const sampleRowForWeek = rows.find((row: any) => getWeekOfYear(row.NgayDay) === effectiveWeek)
    if (sampleRowForWeek) {
      const sampleDate = new Date(sampleRowForWeek.NgayDay)
      const jsDay = sampleDate.getDay()
      const mondayOffset = jsDay === 0 ? -6 : 1 - jsDay
      const monday = new Date(sampleDate)
      monday.setDate(monday.getDate() + mondayOffset)
      monday.setHours(12, 0, 0, 0)
      weekDates = Array.from({ length: 6 }, (_, index) => {
        const current = new Date(monday)
        current.setDate(monday.getDate() + index)
        return formatIsoDateLocal(current)
      })
    }

    const mappedSchedule = rows
      .map((row: any) => {
        const rowWeek = getWeekOfYear(row.NgayDay)
        if (!rowWeek || rowWeek !== effectiveWeek) return null

        const day = mapDayToCell(row.NgayDay)
        if (day === null) return null

        const slot = resolveSlot(String(row.Buoi || ""))
        const periodRange = resolvePeriodRange(String(row.Buoi || ""))

        return {
          id: String(row.MaLD || "").trim(),
          day,
          slot,
          periodStart: periodRange.start,
          periodEnd: periodRange.end,
          course: String(row.TenMon || `Môn ${row.MaMon}`).trim(),
          class: String(row.TenLop || `Lớp ${row.MaLop}`).trim(),
          instructor: String(row.TenGV || `GV ${row.MaGV}`).trim(),
          room: String(row.TenPhong || `P${row.MaPhong}`).trim(),
          semester: String(row.HocKyDay || "").trim(),
          date: row.NgayDay,
          session: String(row.Buoi || "").trim(),
          periods: Number(row.SoTietDay || 0),
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

    const departments = Array.from(
      new Map(
        rows
          .map((row: any): [string, string] => [String(row.MaKhoa || "").trim(), String(row.TenKhoa || "").trim()])
          .filter(([id, name]: [string, string]) => id && name)
      ).entries()
    ).map(([id, name]) => ({ id, name }))

    const majors = Array.from(
      new Map(
        rows
          .map((row: any): [string, string] => [String(row.MaNganh || "").trim(), String(row.TenNganh || "").trim()])
          .filter(([id, name]: [string, string]) => id && name)
      ).entries()
    ).map(([id, name]) => ({ id, name }))

    const classes = Array.from(
      new Map(
        rows
          .map((row: any): [string, string] => [String(row.MaLop || "").trim(), String(row.TenLop || "").trim()])
          .filter(([id, name]: [string, string]) => id && name)
      ).entries()
    ).map(([id, name]) => ({ id, name }))

    const instructors = session.role === "user"
      ? [{ id: String(session.maGV || "").trim(), name: String(session.tenGV || "Giảng viên").trim(), email: "" }]
      : Array.from(
          new Map<string, { name: string; email: string }>(
            rows
              .map((row: any): [string, { name: string; email: string }] => [
                String(row.MaGV || "").trim(),
                { name: String(row.TenGV || "").trim(), email: String(row.EmailGV || "").trim() },
              ])
              .filter(([id, detail]: [string, { name: string; email: string }]) => id && detail.name)
          ).entries()
        ).map(([id, detail]: [string, { name: string; email: string }]) => ({ id, name: detail.name, email: detail.email }))

    return NextResponse.json({
      success: true,
      data: {
        schedule: mappedSchedule,
        filters: {
          semesters,
          weeks: weekOptions,
          weekDates,
          departments,
          majors,
          classes,
          instructors,
          currentWeek: effectiveWeek,
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
