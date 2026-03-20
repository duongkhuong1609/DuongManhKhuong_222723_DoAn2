import { NextRequest, NextResponse } from "next/server"
import { decodeSession, SESSION_COOKIE_NAME } from "@/lib/auth-session"
import { getMssqlPool } from "@/lib/mssql"
import { MSSQL_DB_CONFIG } from "@/lib/db-config"

const sql = require("mssql")

const dbConfig = {
  ...MSSQL_DB_CONFIG,
  requestTimeout: 45000,
}

const SCHEDULE_NOT_DELETED_SQL = `
  UPPER(LTRIM(RTRIM(ISNULL(CAST(ld.TrangThai AS NVARCHAR(50)), ''))))
  NOT IN (N'ĐÃ XÓA', N'DA XOA', N'DELETED', N'HỦY', N'HUY', N'CANCELLED', N'CANCELED')
`

const toIsoDate = (value: unknown) => {
  const date = new Date(String(value || ""))
  if (Number.isNaN(date.getTime())) return ""
  return date.toISOString().slice(0, 10)
}

const toDateLabel = (value: unknown) => {
  const date = new Date(String(value || ""))
  if (Number.isNaN(date.getTime())) return ""
  return date.toLocaleDateString("vi-VN")
}

const toWeekdayLabel = (value: unknown) => {
  const date = new Date(String(value || ""))
  if (Number.isNaN(date.getTime())) return ""
  const jsDay = date.getDay()
  if (jsDay === 0) return "Chủ nhật"
  return `Thứ ${jsDay + 1}`
}

const parseDate = (value: unknown) => {
  const date = new Date(String(value || ""))
  if (Number.isNaN(date.getTime())) return null
  date.setHours(0, 0, 0, 0)
  return date
}

export async function GET(request: NextRequest) {
  try {
    const rawSession = request.cookies.get(SESSION_COOKIE_NAME)?.value
    const session = decodeSession(rawSession)

    if (!session) {
      return NextResponse.json({ success: false, error: "Chưa đăng nhập" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const requestedYear = Number(searchParams.get("year") || 0)
    const requestedSemesterId = String(searchParams.get("semesterId") || "all").trim()

    const pool = await getMssqlPool(dbConfig)

    const currentYear = new Date().getFullYear()

    const yearResult = await pool.request().query(`
      SELECT DISTINCT YEAR(ld.NgayDay) AS Nam
      FROM LICH_DAY ld
      WHERE ld.NgayDay IS NOT NULL
      ORDER BY YEAR(ld.NgayDay) DESC
    `)

    const rawYears: number[] = (yearResult.recordset || [])
      .map((row: any) => Number(row.Nam || 0))
      .filter((year: number) => Number.isFinite(year) && year >= 2000 && year <= 3000)
      .concat([currentYear])

    const yearSet = new Set<number>(rawYears)
    const selectableYears: number[] = (Array.from(yearSet) as number[]).sort((a: number, b: number) => b - a)

    const selectedYear: number = selectableYears.includes(requestedYear)
      ? requestedYear
      : (selectableYears[0] || currentYear)

    const semesterResult = await pool.request().query(`
      SELECT hk.MaHK, hk.TenHK, hk.TuNgay, hk.DenNgay
      FROM HOC_KY hk
      ORDER BY hk.MaHK DESC
    `)

    const semesterRows = semesterResult.recordset || []
    const semesterOptionsAll = semesterRows
      .map((row: any) => {
        const start = parseDate(row.TuNgay)
        const end = parseDate(row.DenNgay)
        return {
          id: String(row.MaHK || "").trim(),
          name: String(row.TenHK || "").trim(),
          startIso: toIsoDate(row.TuNgay),
          endIso: toIsoDate(row.DenNgay),
          start,
          end,
          label: `${String(row.TenHK || "").trim()} (${toDateLabel(row.TuNgay)} - ${toDateLabel(row.DenNgay)})`,
        }
      })
      .filter((item: any) => item.id && item.name)

    const semesterOptionsByYear = semesterOptionsAll.filter((item: any) => {
      if (!item.start || !item.end) return false
      return item.start.getFullYear() <= selectedYear && item.end.getFullYear() >= selectedYear
    })

    const semesterOptions = semesterOptionsByYear.length > 0 ? semesterOptionsByYear : semesterOptionsAll
    const selectedSemester = semesterOptions.find((item: any) => item.id === requestedSemesterId) || null

    const semesterNameFilter = selectedSemester ? String(selectedSemester.name || "").trim() : ""

    const [teacherCountResult, courseCountResult, classCountResult, roomCountResult, scheduleCountResult] = await Promise.all([
      pool.request().query(`
        SELECT COUNT(1) AS Cnt
        FROM GIANG_VIEN gv
        WHERE UPPER(
          REPLACE(
            REPLACE(LTRIM(RTRIM(ISNULL(CAST(gv.TrangThai AS NVARCHAR(50)), ''))), N'Đ', N'D'),
            N'đ',
            N'd'
          ) COLLATE Latin1_General_100_CI_AI
        ) IN (N'CO THE DAY', N'ACTIVE', N'HOAT DONG', N'DANG DAY', N'')
          AND UPPER(
            REPLACE(
              REPLACE(LTRIM(RTRIM(ISNULL(CAST(gv.TrangThai AS NVARCHAR(50)), ''))), N'Đ', N'D'),
              N'đ',
              N'd'
            ) COLLATE Latin1_General_100_CI_AI
          ) NOT IN (N'TAM DUNG', N'TAM NGUNG', N'VO HIEU HOA', N'INACTIVE')
      `),
      pool.request().query(`SELECT COUNT(1) AS Cnt FROM MON`),
      pool.request().query(`
        SELECT COUNT(1) AS Cnt
        FROM LOP l
        WHERE TRY_CONVERT(INT, l.Nam) BETWEEN 1 AND 4
          AND UPPER(LTRIM(RTRIM(ISNULL(CAST(l.TrangThai AS NVARCHAR(50)), '')))) NOT IN (N'ĐÃ TỐT NGHIỆP', N'DA TOT NGHIEP')
      `),
      pool.request().query(`
        SELECT COUNT(1) AS Cnt
        FROM PHONG p
        WHERE UPPER(LTRIM(RTRIM(ISNULL(CAST(p.TrangThai AS NVARCHAR(50)), '')))) NOT IN (N'BẢO TRÌ', N'BAO TRI', N'KHÓA', N'KHOA', N'INACTIVE')
      `),
      (() => {
        const requestDb = pool.request().input("selectedYear", sql.Int, selectedYear)
        const conditions = ["YEAR(ld.NgayDay) = @selectedYear", SCHEDULE_NOT_DELETED_SQL]
        if (selectedSemester && semesterNameFilter) {
          requestDb.input("semesterName", sql.NVarChar(100), semesterNameFilter)
          conditions.push("LTRIM(RTRIM(ISNULL(CAST(ld.HocKyDay AS NVARCHAR(100)), ''))) = @semesterName")
        }
        return requestDb.query(`
          SELECT COUNT(1) AS Cnt
          FROM LICH_DAY ld
          WHERE ${conditions.join(" AND ")}
        `)
      })(),
    ])

    const recentRequest = pool.request().input("selectedYear", sql.Int, selectedYear)
    const recentConditions = ["YEAR(ld.NgayDay) = @selectedYear", SCHEDULE_NOT_DELETED_SQL]
    if (selectedSemester && semesterNameFilter) {
      recentRequest.input("semesterName", sql.NVarChar(100), semesterNameFilter)
      recentConditions.push("LTRIM(RTRIM(ISNULL(CAST(ld.HocKyDay AS NVARCHAR(100)), ''))) = @semesterName")
    }

    const recentScheduleResult = await recentRequest.query(`
      SELECT TOP 15
        ld.MaLD,
        ld.NgayDay,
        ld.Buoi,
        mon.TenMon,
        gv.TenGV,
        p.TenPhong,
        l.TenLop
      FROM LICH_DAY ld
      LEFT JOIN MON mon ON mon.MaMon = ld.MaMon
      LEFT JOIN GIANG_VIEN gv ON gv.MaGV = ld.MaGV
      LEFT JOIN PHONG p ON p.MaPhong = ld.MaPhong
      LEFT JOIN LOP l ON l.MaLop = ld.MaLop
      WHERE ${recentConditions.join(" AND ")}
      ORDER BY ld.NgayDay DESC, ld.MaLD DESC
    `)

    const recentSchedules = (recentScheduleResult.recordset || []).map((row: any) => ({
      id: String(row.MaLD || "").trim(),
      date: toDateLabel(row.NgayDay),
      weekday: toWeekdayLabel(row.NgayDay),
      session: String(row.Buoi || "").trim(),
      courseName: String(row.TenMon || "").trim(),
      instructorName: String(row.TenGV || "").trim(),
      roomName: String(row.TenPhong || "").trim(),
      className: String(row.TenLop || "").trim(),
    }))

    return NextResponse.json({
      success: true,
      data: {
        filters: {
          years: selectableYears,
          selectedYear,
          semesters: semesterOptions.map((item: any) => ({
            id: item.id,
            name: item.name,
            label: item.label,
          })),
          selectedSemesterId: selectedSemester?.id || "all",
          selectedSemesterName: selectedSemester?.name || "Tất cả học kỳ",
          academicYearLabel: `${selectedYear}-${selectedYear + 1}`,
        },
        overview: {
          activeInstructors: Number(teacherCountResult.recordset?.[0]?.Cnt || 0),
          totalCourses: Number(courseCountResult.recordset?.[0]?.Cnt || 0),
          activeClasses: Number(classCountResult.recordset?.[0]?.Cnt || 0),
          availableRooms: Number(roomCountResult.recordset?.[0]?.Cnt || 0),
          totalSchedules: Number(scheduleCountResult.recordset?.[0]?.Cnt || 0),
        },
        recentSchedules,
      },
    })
  } catch (error) {
    console.error("Error loading overview data:", error)
    return NextResponse.json({ success: false, error: "Lỗi khi tải dữ liệu tổng quan" }, { status: 500 })
  }
}
