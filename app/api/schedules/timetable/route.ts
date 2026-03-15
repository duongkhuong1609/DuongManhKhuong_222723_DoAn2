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

const getIsoWeekInfo = (value: unknown) => {
  const date = new Date(String(value || ""))
  if (Number.isNaN(date.getTime())) return null

  const utcDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = utcDate.getUTCDay() || 7
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - dayNum)
  const isoYear = utcDate.getUTCFullYear()
  const yearStart = new Date(Date.UTC(isoYear, 0, 1))
  const week = Math.ceil((((utcDate.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
  if (!Number.isFinite(week) || week <= 0) return null
  return { week, year: isoYear }
}

const getIsoWeekCount = (year: number) => {
  const marker = new Date(Date.UTC(year, 11, 28))
  const info = getIsoWeekInfo(marker)
  return info?.week || 52
}

const getMondayFromIsoWeek = (weekYear: number, week: number) => {
  const firstThursday = new Date(Date.UTC(weekYear, 0, 4))
  const firstThursdayDay = firstThursday.getUTCDay() || 7
  const weekOneMonday = new Date(firstThursday)
  weekOneMonday.setUTCDate(firstThursday.getUTCDate() - firstThursdayDay + 1)

  const monday = new Date(weekOneMonday)
  monday.setUTCDate(weekOneMonday.getUTCDate() + (week - 1) * 7)
  monday.setUTCHours(12, 0, 0, 0)
  return monday
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
  if (day === 0) return 6
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

const RESCHEDULE_SESSION_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "1-5", label: "Buổi sáng (Tiết 1-5)" },
  { value: "7-11", label: "Buổi chiều (Tiết 7-11)" },
]

const formatIsoDateLocal = (date: Date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

const normalizeLessonStatus = (value: unknown) => {
  const raw = String(value || "").trim().toLowerCase()
  if (!raw) return "Đang diễn ra"
  if (
    raw.includes("tam ngung") ||
    raw.includes("tạm ngưng") ||
    raw.includes("tam dung") ||
    raw.includes("tạm dừng") ||
    raw.includes("paused")
  ) {
    return "Tạm ngưng"
  }
  if (raw.includes("huy") || raw.includes("hủy") || raw.includes("deleted") || raw.includes("da xoa") || raw.includes("đã xóa")) {
    return "Đã xóa"
  }
  return "Đang diễn ra"
}

const overlaps = (aStart: number, aEnd: number, bStart: number, bEnd: number) => {
  return aStart <= bEnd && bStart <= aEnd
}

const normalizeVietnameseText = (value: unknown) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u2013\u2014]/g, "-")
    .toLowerCase()
    .trim()

const isPracticeCourse = (courseName: unknown) => {
  const normalized = normalizeVietnameseText(courseName)
  if (!normalized) return false
  return /(?:[-_\s(\[]+)?thuc hanh(?:\s*\d+)?\s*[)\]]?$/.test(normalized)
}

const isPracticeCourseType = (courseType: unknown, courseName: unknown) => {
  const normalizedType = normalizeVietnameseText(courseType)
  if (normalizedType.includes("thuc hanh")) return true
  return isPracticeCourse(courseName)
}

const getBaseCourseKey = (courseName: unknown) => {
  const normalized = normalizeVietnameseText(courseName)
  if (!normalized) return ""
  return normalized
    .replace(/(?:[-_\s(\[]+)?thuc hanh(?:\s*\d+)?\s*[)\]]?$/, "")
    .replace(/(?:[-_\s(\[]+)?ly thuyet(?:\s*\d+)?\s*[)\]]?$/, "")
    .trim()
}

const compareDatePeriod = (aDateIso: string, aPeriod: number, bDateIso: string, bPeriod: number) => {
  if (aDateIso < bDateIso) return -1
  if (aDateIso > bDateIso) return 1
  if (aPeriod < bPeriod) return -1
  if (aPeriod > bPeriod) return 1
  return 0
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
    const mode = String(searchParams.get("mode") || "").trim().toLowerCase()
    const semester = String(searchParams.get("semester") || "all").trim()
    const week = Number(searchParams.get("week") || 0)
    const requestedWeekYear = Number(searchParams.get("weekYear") || 0)
    const requestedAcademicYearStart = Number(searchParams.get("academicYearStart") || 0)
    const anchorDate = String(searchParams.get("anchorDate") || "").trim()
    const monthParam = String(searchParams.get("month") || "all").trim()
    const yearParam = String(searchParams.get("year") || "all").trim()
    const month = monthParam === "all" ? 0 : Number(monthParam)
    const year = yearParam === "all" ? 0 : Number(yearParam)
    const requestedInstructor = String(searchParams.get("instructor") || "all").trim()
    const department = String(searchParams.get("department") || "all").trim()
    const major = String(searchParams.get("major") || "all").trim()
    const classId = String(searchParams.get("classId") || "all").trim()

    pool = await new sql.ConnectionPool(dbConfig).connect()

    if (mode === "reschedule-options") {
      if (session.role === "user") {
        return NextResponse.json({ success: false, error: "Bạn không có quyền điều chỉnh lịch dạy" }, { status: 403 })
      }

      const scheduleId = Number(searchParams.get("scheduleId") || 0)
      if (!Number.isFinite(scheduleId) || scheduleId <= 0) {
        return NextResponse.json({ success: false, error: "Thiếu mã lịch dạy cần điều chỉnh" }, { status: 400 })
      }

            const lessonResult = await pool.request().input("scheduleId", sql.Int, scheduleId).query(`
         SELECT TOP 1 ld.MaLD, ld.MaLop, ld.MaMon, ld.MaGV, ld.MaPhong, ld.NgayDay, ld.Buoi, ld.SoTietDay, ld.HocKyDay,
           l.TenLop, m.TenMon, m.LoaiMon, gv.TenGV
        FROM LICH_DAY ld
        LEFT JOIN LOP l ON l.MaLop = ld.MaLop
        LEFT JOIN MON m ON m.MaMon = ld.MaMon
        LEFT JOIN GIANG_VIEN gv ON gv.MaGV = ld.MaGV
        WHERE ld.MaLD = @scheduleId
      `)

      const lesson = lessonResult.recordset?.[0]
      if (!lesson) {
        return NextResponse.json({ success: false, error: "Không tìm thấy lịch dạy cần điều chỉnh" }, { status: 404 })
      }

      const oldDate = new Date(String(lesson.NgayDay || ""))
      if (Number.isNaN(oldDate.getTime())) {
        return NextResponse.json({ success: false, error: "Ngày dạy hiện tại không hợp lệ" }, { status: 400 })
      }
      oldDate.setHours(0, 0, 0, 0)

      const semesterRangeResult = await pool.request().input("hocKyDay", String(lesson.HocKyDay || "").trim()).query(`
        SELECT TOP 1 TuNgay, DenNgay
        FROM HOC_KY
        WHERE LTRIM(RTRIM(ISNULL(CAST(TenHK AS NVARCHAR(50)), ''))) = @hocKyDay
        ORDER BY MaHK DESC
      `)

      const semesterStartRaw = semesterRangeResult.recordset?.[0]?.TuNgay
      const semesterEndRaw = semesterRangeResult.recordset?.[0]?.DenNgay
      const semesterStart = new Date(String(semesterStartRaw || ""))
      const semesterEnd = new Date(String(semesterEndRaw || ""))
      if (Number.isNaN(semesterStart.getTime()) || Number.isNaN(semesterEnd.getTime())) {
        return NextResponse.json({ success: false, error: "Không xác định được khoảng ngày học kỳ để dời lịch" }, { status: 400 })
      }
      semesterStart.setHours(0, 0, 0, 0)
      semesterEnd.setHours(23, 59, 59, 999)

      const isPracticeTarget = isPracticeCourseType(lesson.LoaiMon, lesson.TenMon)
      const targetBaseCourseKey = getBaseCourseKey(lesson.TenMon)
      let theoryMoments: Array<{ dateIso: string; periodEnd: number }> = []

      if (isPracticeTarget && targetBaseCourseKey) {
        const theoryRowsResult = await pool.request()
          .input("maLopTheory", sql.Int, Number(lesson.MaLop || 0))
          .input("excludeScheduleIdTheory", sql.Int, scheduleId)
          .input("semesterStartTheory", sql.DateTime, semesterStart)
          .input("semesterEndTheory", sql.DateTime, semesterEnd)
          .query(`
            SELECT ld.NgayDay, ld.Buoi, m.TenMon, m.LoaiMon
            FROM LICH_DAY ld
            LEFT JOIN MON m ON m.MaMon = ld.MaMon
            WHERE ld.MaLop = @maLopTheory
              AND ld.MaLD <> @excludeScheduleIdTheory
              AND ld.NgayDay >= @semesterStartTheory
              AND ld.NgayDay <= @semesterEndTheory
              AND UPPER(LTRIM(RTRIM(ISNULL(CAST(ld.TrangThai AS NVARCHAR(50)), '')))) NOT IN (
                N'ĐÃ XÓA', N'DA XOA', N'DELETED', N'HỦY', N'HUY', N'CANCELLED', N'CANCELED',
                N'TẠM NGƯNG', N'TAM NGUNG', N'TẠM DỪNG', N'TAM DUNG', N'PAUSED'
              )
          `)

        theoryMoments = (theoryRowsResult.recordset || [])
          .filter((row: any) => getBaseCourseKey(row.TenMon) === targetBaseCourseKey)
          .filter((row: any) => !isPracticeCourseType(row.LoaiMon, row.TenMon))
          .map((row: any) => {
            const date = new Date(String(row.NgayDay || ""))
            if (Number.isNaN(date.getTime())) return null
            const dateIso = formatIsoDateLocal(date)
            const range = resolvePeriodRange(String(row.Buoi || "").trim())
            return { dateIso, periodEnd: range.end }
          })
          .filter((item: any): item is { dateIso: string; periodEnd: number } => Boolean(item))
      }

      const oldSession = String(lesson.Buoi || "").trim()
      const oldSessionLower = oldSession.toLowerCase()

      const availableSessionOptions = [...RESCHEDULE_SESSION_OPTIONS]
      if (oldSession && !availableSessionOptions.some((item) => item.value.toLowerCase() === oldSessionLower)) {
        availableSessionOptions.unshift({
          value: oldSession,
          label: `Giữ buổi hiện tại (${oldSession})`,
        })
      }

      const conflictCandidateResult = await pool.request()
        .input("maLop", sql.Int, Number(lesson.MaLop || 0))
        .input("maGV", sql.Int, Number(lesson.MaGV || 0))
        .input("maPhong", sql.Int, Number(lesson.MaPhong || 0))
        .input("semesterStart", sql.DateTime, semesterStart)
        .input("semesterEnd", sql.DateTime, semesterEnd)
        .input("excludeScheduleId", sql.Int, scheduleId)
        .query(`
          SELECT
            CONVERT(date, ld.NgayDay) AS BusyDate,
            ld.MaLop,
            ld.MaGV,
            ld.MaPhong,
            ld.Buoi
          FROM LICH_DAY ld
          WHERE (
            ld.MaLop = @maLop
            OR ld.MaGV = @maGV
            OR ld.MaPhong = @maPhong
          )
            AND ld.MaLD <> @excludeScheduleId
            AND ld.NgayDay >= @semesterStart
            AND ld.NgayDay <= @semesterEnd
            AND UPPER(LTRIM(RTRIM(ISNULL(CAST(ld.TrangThai AS NVARCHAR(50)), '')))) NOT IN (
              N'ĐÃ XÓA', N'DA XOA', N'DELETED', N'HỦY', N'HUY', N'CANCELLED', N'CANCELED',
              N'TẠM NGƯNG', N'TAM NGUNG', N'TẠM DỪNG', N'TAM DUNG', N'PAUSED'
            )
          ORDER BY BusyDate ASC
        `)

      const conflictMapByDate = new Map<string, Array<{ maLop: number; maGV: number; maPhong: number; rangeStart: number; rangeEnd: number }>>()
      for (const row of conflictCandidateResult.recordset || []) {
        const date = new Date(String(row.BusyDate || ""))
        if (Number.isNaN(date.getTime())) continue

        const isoDate = formatIsoDateLocal(date)
        const candidateRange = resolvePeriodRange(String(row.Buoi || ""))
        const byDate = conflictMapByDate.get(isoDate) || []
        byDate.push({
          maLop: Number(row.MaLop || 0),
          maGV: Number(row.MaGV || 0),
          maPhong: Number(row.MaPhong || 0),
          rangeStart: candidateRange.start,
          rangeEnd: candidateRange.end,
        })
        conflictMapByDate.set(isoDate, byDate)
      }

      const oldDateIso = formatIsoDateLocal(oldDate)
      const availableSlots: Array<{ value: string; date: string; session: string; label: string }> = []
      const cursor = new Date(semesterStart)
      cursor.setHours(0, 0, 0, 0)

      while (cursor <= semesterEnd && availableSlots.length < 240) {
        const iso = formatIsoDateLocal(cursor)
        const busyRows = conflictMapByDate.get(iso) || []

        for (const option of availableSessionOptions) {
          const candidateSession = String(option.value || "").trim()
          if (!candidateSession) continue

          const isOldSlot = iso === oldDateIso && candidateSession.toLowerCase() === oldSessionLower
          if (isOldSlot) continue

          const candidateRange = resolvePeriodRange(candidateSession)
          const hasConflict = busyRows.some((row) => {
            if (!overlaps(candidateRange.start, candidateRange.end, row.rangeStart, row.rangeEnd)) return false
            return (
              row.maLop === Number(lesson.MaLop || 0) ||
              row.maGV === Number(lesson.MaGV || 0) ||
              row.maPhong === Number(lesson.MaPhong || 0)
            )
          })
          if (hasConflict) continue

          const violatesTheoryBeforePractice = isPracticeTarget && theoryMoments.some((theory: { dateIso: string; periodEnd: number }) =>
            compareDatePeriod(iso, candidateRange.start, theory.dateIso, theory.periodEnd) <= 0
          )
          if (violatesTheoryBeforePractice) continue

          availableSlots.push({
            value: `${iso}|${candidateSession}`,
            date: iso,
            session: candidateSession,
            label: `${cursor.toLocaleDateString("vi-VN")} • ${option.label}`,
          })
        }

        cursor.setDate(cursor.getDate() + 1)
      }

      const availableDates = Array.from(new Set(availableSlots.map((item) => item.date))).map((dateValue) => {
        const date = new Date(`${dateValue}T00:00:00`)
        return {
          value: dateValue,
          label: Number.isNaN(date.getTime()) ? dateValue : date.toLocaleDateString("vi-VN"),
        }
      })

      return NextResponse.json({
        success: true,
        data: {
          schedule: {
            id: String(lesson.MaLD || "").trim(),
            className: String(lesson.TenLop || `Lớp ${lesson.MaLop}`).trim(),
            courseName: String(lesson.TenMon || `Môn ${lesson.MaMon}`).trim(),
            instructorName: String(lesson.TenGV || `GV ${lesson.MaGV}`).trim(),
            oldDate: formatIsoDateLocal(oldDate),
            session: String(lesson.Buoi || "").trim(),
            periods: Number(lesson.SoTietDay || 0),
            semesterStart: formatIsoDateLocal(semesterStart),
            semesterEnd: formatIsoDateLocal(semesterEnd),
          },
          availableSlots,
          availableDates,
        },
      })
    }

    const currentYear = new Date().getFullYear()
    let resolvedAcademicYearStart = requestedAcademicYearStart

    if (!Number.isFinite(resolvedAcademicYearStart) || resolvedAcademicYearStart < 1900 || resolvedAcademicYearStart > 9999) {
      const classYearResult = await pool.request().query(`
        SELECT TOP 1
          TRY_CONVERT(INT, LEFT(LTRIM(RTRIM(ISNULL(l.NienKhoa, ''))), CHARINDEX('-', LTRIM(RTRIM(ISNULL(l.NienKhoa, ''))) + '-') - 1))
          + TRY_CONVERT(INT, l.Nam) - 1 AS AcademicYearStart
        FROM LOP l
        WHERE TRY_CONVERT(INT, l.Nam) BETWEEN 1 AND 4
          AND UPPER(LTRIM(RTRIM(ISNULL(CAST(l.TrangThai AS NVARCHAR(50)), '')))) NOT IN (N'ĐÃ TỐT NGHIỆP', N'DA TOT NGHIEP')
        ORDER BY AcademicYearStart DESC
      `)

      const inferred = Number(classYearResult.recordset?.[0]?.AcademicYearStart || 0)
      if (Number.isFinite(inferred) && inferred >= 1900 && inferred <= 9999) {
        resolvedAcademicYearStart = inferred
      } else {
        resolvedAcademicYearStart = currentYear - 1
      }
    }

    const weekYears = [resolvedAcademicYearStart, resolvedAcademicYearStart + 1]
    const weekOptionsByYear = new Map<number, number[]>()
    for (const yearValue of weekYears) {
      const maxWeek = getIsoWeekCount(yearValue)
      const values = Array.from({ length: maxWeek }, (_, idx) => idx + 1)
      weekOptionsByYear.set(yearValue, values)
    }

    const instructorFilter =
      session.role === "user"
        ? String(session.maGV || "").trim()
        : requestedInstructor !== "all"
          ? requestedInstructor
          : ""

    const shouldFetchScheduleRows =
      session.role === "user" ||
      Boolean(instructorFilter) ||
      classId !== "all"

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

    if (Number.isFinite(month) && month >= 1 && month <= 12) {
      whereConditions.push("MONTH(ld.NgayDay) = @month")
      dbRequest.input("month", month)
    }

    if (Number.isFinite(year) && year >= 1900 && year <= 9999) {
      whereConditions.push("YEAR(ld.NgayDay) = @year")
      dbRequest.input("year", year)
    }

    const whereSql = whereConditions.length ? `WHERE ${whereConditions.join(" AND ")}` : ""

    const rows = shouldFetchScheduleRows
      ? (await dbRequest.query(`
          SELECT
            ld.MaLD,
            ld.MaLop,
            lop.TenLop,
            ld.MaMon,
            mon.TenMon,
            mon.SoTinChi,
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
            ld.TrangThai,
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
        `)).recordset || []
      : []

    let effectiveWeekYear = Number.isFinite(requestedWeekYear) && weekOptionsByYear.has(requestedWeekYear)
      ? requestedWeekYear
      : weekYears[0]

    let weekOptions: number[] = [...(weekOptionsByYear.get(effectiveWeekYear) || [])]

    const extractedYears: number[] = rows
      .map((row: any) => {
        const date = new Date(String(row.NgayDay || ""))
        if (Number.isNaN(date.getTime())) return null
        return date.getFullYear()
      })
      .filter((value: number | null): value is number => value !== null)

    const yearOptions = Array.from(new Set<number>(extractedYears)).sort((a, b) => a - b)

    const extractedAnchorDates: string[] = rows
      .map((row: any) => {
        const date = new Date(String(row.NgayDay || ""))
        if (Number.isNaN(date.getTime())) return null
        return formatIsoDateLocal(date)
      })
      .filter((value: string | null): value is string => value !== null)

    const anchorDateKeys = Array.from(new Set<string>(extractedAnchorDates)).sort((a, b) => b.localeCompare(a))
    const anchorDateOptions = anchorDateKeys.map((value) => ({
      value,
      label: new Date(value).toLocaleDateString("vi-VN"),
    }))

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
    if (anchorDate) {
      const parsedAnchorDate = new Date(anchorDate)
      if (!Number.isNaN(parsedAnchorDate.getTime())) {
        const info = getIsoWeekInfo(parsedAnchorDate)
        if (info && weekOptionsByYear.has(info.year)) {
          effectiveWeekYear = info.year
          effectiveWeek = info.week
          weekOptions = [...(weekOptionsByYear.get(effectiveWeekYear) || [])]
        }
      }
    }

    if (!Number.isFinite(effectiveWeek) || effectiveWeek <= 0) {
      effectiveWeek = weekOptions[0] || 1
    }

    if (weekOptions.length > 0 && !weekOptions.includes(effectiveWeek)) {
      effectiveWeek = weekOptions[0]
    }

    const weekStartDates = new Map<string, string>()
    for (const yearValue of weekYears) {
      const values = weekOptionsByYear.get(yearValue) || []
      for (const weekValue of values) {
        const monday = getMondayFromIsoWeek(yearValue, weekValue)
        weekStartDates.set(`${yearValue}-${weekValue}`, formatIsoDateLocal(monday))
      }
    }

    const monday = getMondayFromIsoWeek(effectiveWeekYear, effectiveWeek)
    const weekDates: string[] = Array.from({ length: 7 }, (_, index) => {
      const current = new Date(monday)
      current.setUTCDate(monday.getUTCDate() + index)
      return formatIsoDateLocal(current)
    })

    const effectiveAnchorDate = weekDates[0] || ""

    const mappedSchedule = rows
      .map((row: any) => {
        const rowWeekInfo = getIsoWeekInfo(row.NgayDay)
        if (!rowWeekInfo) return null
        if (rowWeekInfo.week !== effectiveWeek || rowWeekInfo.year !== effectiveWeekYear) return null

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
          trangThai: normalizeLessonStatus(row.TrangThai),
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

    // Compute class summary: unique courses + total credits when a class is selected
    let classSummary: {
      totalCourses: number
      totalCredits: number
      totalPeriods: number
      courses: Array<{ maMon: number; tenMon: string; soTinChi: number }>
    } | null = null
    if (classId !== "all") {
      const courseMap = new Map<number, { tenMon: string; soTinChi: number }>()
      for (const row of rows) {
        const maMon = Number(row.MaMon || 0)
        if (maMon > 0 && !courseMap.has(maMon)) {
          courseMap.set(maMon, {
            tenMon: String(row.TenMon || `Môn ${maMon}`).trim(),
            soTinChi: Number(row.SoTinChi || 0),
          })
        }
      }
      const courses = Array.from(courseMap.entries())
        .map(([maMon, detail]) => ({ maMon, tenMon: detail.tenMon, soTinChi: detail.soTinChi }))
        .sort((a, b) => a.tenMon.localeCompare(b.tenMon, "vi"))

      const totalCredits = courses.reduce((sum, item) => sum + Number(item.soTinChi || 0), 0)
      const totalPeriods = rows.reduce((sum: number, row: any) => sum + Number(row.SoTietDay || 0), 0)
      classSummary = { totalCourses: courses.length, totalCredits, totalPeriods, courses }
    }

    const semesters = (allSemestersResult.recordset || [])
      .map((row: any) => String(row.HocKyDay || "").trim())
      .filter(Boolean)

    const departmentResult = await pool.request().query(`
      SELECT MaKhoa, TenKhoa
      FROM KHOA
      ORDER BY TenKhoa ASC
    `)

    const departments = (departmentResult.recordset || [])
      .map((row: any) => ({
        id: String(row.MaKhoa || "").trim(),
        name: String(row.TenKhoa || "").trim(),
      }))
      .filter((item: any) => item.id && item.name)

    const majorRequest = pool.request()
    const majorConditions: string[] = []
    if (department !== "all") {
      majorConditions.push("CAST(n.MaKhoa AS NVARCHAR(50)) = @department")
      majorRequest.input("department", department)
    }

    const majorResult = await majorRequest.query(`
      SELECT n.MaNganh, n.TenNganh
      FROM NGANH n
      ${majorConditions.length ? `WHERE ${majorConditions.join(" AND ")}` : ""}
      ORDER BY n.TenNganh ASC
    `)

    const majors = (majorResult.recordset || [])
      .map((row: any) => ({
        id: String(row.MaNganh || "").trim(),
        name: String(row.TenNganh || "").trim(),
      }))
      .filter((item: any) => item.id && item.name)

    const classes = instructorFilter
      ? Array.from(
          new Map(
            rows
              .map((row: any): [string, string] => [String(row.MaLop || "").trim(), String(row.TenLop || "").trim()])
              .filter(([id, name]: [string, string]) => id && name)
          ).entries()
        ).map(([id, name]) => ({ id, name }))
      : await (async () => {
          const classFilterConditions = ["TRY_CONVERT(INT, l.Nam) BETWEEN 1 AND 4"]
          const classFilterRequest = pool.request()

          if (department !== "all") {
            classFilterConditions.push("CAST(k.MaKhoa AS NVARCHAR(50)) = @classDepartment")
            classFilterRequest.input("classDepartment", department)
          }

          if (major !== "all") {
            classFilterConditions.push("CAST(n.MaNganh AS NVARCHAR(50)) = @classMajor")
            classFilterRequest.input("classMajor", major)
          }

          const classesResult = await classFilterRequest.query(`
            SELECT l.MaLop, l.TenLop
            FROM LOP l
            LEFT JOIN NGANH n ON n.MaNganh = l.MaNganh
            LEFT JOIN KHOA k ON k.MaKhoa = n.MaKhoa
            WHERE ${classFilterConditions.join(" AND ")}
              AND UPPER(LTRIM(RTRIM(ISNULL(CAST(l.TrangThai AS NVARCHAR(50)), '')))) NOT IN (N'ĐÃ TỐT NGHIỆP', N'DA TOT NGHIEP')
            ORDER BY TRY_CONVERT(INT, l.Nam) ASC, l.TenLop ASC
          `)

          return Array.from(
            new Map(
              (classesResult.recordset || [])
                .map((row: any): [string, string] => [String(row.MaLop || "").trim(), String(row.TenLop || "").trim()])
                .filter(([id, name]: [string, string]) => id && name)
            ).entries()
          ).map(([id, name]) => ({ id, name }))
        })()

    const instructors = session.role === "user"
      ? [{ id: String(session.maGV || "").trim(), name: String(session.tenGV || "Giảng viên").trim(), email: "" }]
      : await (async () => {
          const instructorRequest = pool.request()
          const instructorConditions: string[] = [
            `UPPER(LTRIM(RTRIM(ISNULL(CAST(gv.TrangThai AS NVARCHAR(50)), '')))) NOT IN (N'VÔ HIỆU HÓA', N'VO HIEU HOA')`,
          ]

          if (department !== "all") {
            instructorConditions.push("CAST(gv.MaKhoa AS NVARCHAR(50)) = @insDepartment")
            instructorRequest.input("insDepartment", department)
          }

          const instructorResult = await instructorRequest.query(`
            SELECT gv.MaGV, gv.TenGV, gv.EmailGV
            FROM GIANG_VIEN gv
            WHERE ${instructorConditions.join(" AND ")}
            ORDER BY gv.TenGV ASC
          `)

          return (instructorResult.recordset || [])
            .map((row: any) => ({
              id: String(row.MaGV || "").trim(),
              name: String(row.TenGV || "").trim(),
              email: String(row.EmailGV || "").trim(),
            }))
            .filter((item: any) => item.id && item.name)
        })()

    return NextResponse.json({
      success: true,
      data: {
        schedule: mappedSchedule,
        classSummary,
        filters: {
          semesters,
          weeks: weekOptions,
          weekYears,
          selectedWeekYear: effectiveWeekYear,
          academicYearStart: resolvedAcademicYearStart,
          weekDates,
          weekStartDates: Object.fromEntries(weekStartDates.entries()),
          years: yearOptions,
          anchorDates: anchorDateOptions,
          departments,
          majors,
          classes,
          instructors,
          currentWeek: effectiveWeek,
          currentAnchorDate: effectiveAnchorDate,
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

export async function POST(request: NextRequest) {
  let pool: any
  let transaction: any
  try {
    const rawSession = request.cookies.get(SESSION_COOKIE_NAME)?.value
    const session = decodeSession(rawSession)

    if (!session) {
      return NextResponse.json({ success: false, error: "Chưa đăng nhập" }, { status: 401 })
    }

    if (session.role === "user") {
      return NextResponse.json({ success: false, error: "Bạn không có quyền điều chỉnh lịch dạy" }, { status: 403 })
    }

    const body = await request.json()
    const action = String(body.action || "").trim().toLowerCase()

    if (action !== "reschedule") {
      return NextResponse.json({ success: false, error: "Hành động không hợp lệ" }, { status: 400 })
    }

    const scheduleId = Number(body.scheduleId || 0)
    const newDateRaw = String(body.newDate || "").trim()
    const newSessionRaw = String(body.newSession || "").trim()

    if (!Number.isFinite(scheduleId) || scheduleId <= 0 || !newDateRaw) {
      return NextResponse.json({ success: false, error: "Thiếu thông tin để dời lịch" }, { status: 400 })
    }

    const newDate = new Date(newDateRaw)
    if (Number.isNaN(newDate.getTime())) {
      return NextResponse.json({ success: false, error: "Ngày mới không hợp lệ" }, { status: 400 })
    }
    newDate.setHours(12, 0, 0, 0)

    pool = await new sql.ConnectionPool(dbConfig).connect()
    transaction = new sql.Transaction(pool)
    await transaction.begin()

    const loadLessonResult = await new sql.Request(transaction)
      .input("scheduleId", sql.Int, scheduleId)
      .query(`
        SELECT TOP 1 ld.MaLD, ld.MaLop, ld.MaMon, ld.MaGV, ld.MaPhong, ld.NgayDay, ld.SoTietDay, ld.HocKyDay, ld.Buoi, ld.Tuan, ld.TrangThai,
               m.TenMon, m.LoaiMon
        FROM LICH_DAY ld
        LEFT JOIN MON m ON m.MaMon = ld.MaMon
        WHERE ld.MaLD = @scheduleId
      `)

    const oldLesson = loadLessonResult.recordset?.[0]
    if (!oldLesson) {
      await transaction.rollback()
      return NextResponse.json({ success: false, error: "Không tìm thấy lịch dạy cần điều chỉnh" }, { status: 404 })
    }

    const oldDate = new Date(String(oldLesson.NgayDay || ""))
    if (Number.isNaN(oldDate.getTime())) {
      await transaction.rollback()
      return NextResponse.json({ success: false, error: "Ngày lịch cũ không hợp lệ" }, { status: 400 })
    }
    oldDate.setHours(0, 0, 0, 0)

    const newDateOnly = new Date(newDate)
    newDateOnly.setHours(0, 0, 0, 0)

    const semesterRangeResult = await new sql.Request(transaction)
      .input("hocKyDay", String(oldLesson.HocKyDay || "").trim())
      .query(`
        SELECT TOP 1 TuNgay, DenNgay
        FROM HOC_KY
        WHERE LTRIM(RTRIM(ISNULL(CAST(TenHK AS NVARCHAR(50)), ''))) = @hocKyDay
        ORDER BY MaHK DESC
      `)

    const semesterStart = new Date(String(semesterRangeResult.recordset?.[0]?.TuNgay || ""))
    const semesterEnd = new Date(String(semesterRangeResult.recordset?.[0]?.DenNgay || ""))
    if (Number.isNaN(semesterStart.getTime()) || Number.isNaN(semesterEnd.getTime())) {
      await transaction.rollback()
      return NextResponse.json({ success: false, error: "Không xác định được khoảng thời gian học kỳ" }, { status: 400 })
    }
    semesterStart.setHours(0, 0, 0, 0)
    semesterEnd.setHours(23, 59, 59, 999)

    if (newDate < semesterStart || newDate > semesterEnd) {
      await transaction.rollback()
      return NextResponse.json({ success: false, error: "Ngày mới phải nằm trong khoảng ngày bắt đầu và kết thúc học kỳ" }, { status: 400 })
    }

    const targetSession = newSessionRaw || String(oldLesson.Buoi || "").trim()
    if (!targetSession) {
      await transaction.rollback()
      return NextResponse.json({ success: false, error: "Buổi học mới không hợp lệ" }, { status: 400 })
    }
    const periodRange = resolvePeriodRange(targetSession)

    const conflictResult = await new sql.Request(transaction)
      .input("scheduleId", sql.Int, scheduleId)
      .input("newDate", sql.DateTime, newDate)
      .input("maLop", sql.Int, Number(oldLesson.MaLop || 0))
      .input("maGV", sql.Int, Number(oldLesson.MaGV || 0))
      .input("maPhong", sql.Int, Number(oldLesson.MaPhong || 0))
      .query(`
        SELECT MaLD, MaLop, MaGV, MaPhong, Buoi, TrangThai
        FROM LICH_DAY
        WHERE MaLD <> @scheduleId
          AND CONVERT(date, NgayDay) = CONVERT(date, @newDate)
          AND UPPER(LTRIM(RTRIM(ISNULL(CAST(TrangThai AS NVARCHAR(50)), '')))) NOT IN (
            N'ĐÃ XÓA', N'DA XOA', N'DELETED', N'HỦY', N'HUY', N'CANCELLED', N'CANCELED',
            N'TẠM NGƯNG', N'TAM NGUNG', N'TẠM DỪNG', N'TAM DUNG', N'PAUSED'
          )
          AND (
            MaLop = @maLop
            OR MaGV = @maGV
            OR MaPhong = @maPhong
          )
      `)

    const conflictRows = conflictResult.recordset || []
    let hasTeacherConflict = false
    let hasClassConflict = false
    let hasRoomConflict = false

    for (const row of conflictRows) {
      const checkRange = resolvePeriodRange(String(row.Buoi || ""))
      if (!overlaps(periodRange.start, periodRange.end, checkRange.start, checkRange.end)) continue

      if (Number(row.MaGV || 0) === Number(oldLesson.MaGV || 0)) hasTeacherConflict = true
      if (Number(row.MaLop || 0) === Number(oldLesson.MaLop || 0)) hasClassConflict = true
      if (Number(row.MaPhong || 0) === Number(oldLesson.MaPhong || 0)) hasRoomConflict = true
    }

    if (hasTeacherConflict || hasClassConflict || hasRoomConflict) {
      await transaction.rollback()
      const reasons: string[] = []
      if (hasTeacherConflict) reasons.push("trùng lịch giảng viên")
      if (hasClassConflict) reasons.push("trùng lịch lớp")
      if (hasRoomConflict) reasons.push("trùng phòng")
      return NextResponse.json({
        success: false,
        error: `Không thể dời lịch do ${reasons.join(", ")}`,
      }, { status: 409 })
    }

    const isPracticeTarget = isPracticeCourseType(oldLesson.LoaiMon, oldLesson.TenMon)
    const targetBaseCourseKey = getBaseCourseKey(oldLesson.TenMon)

    if (isPracticeTarget && targetBaseCourseKey) {
      const theoryRowsResult = await new sql.Request(transaction)
        .input("maLopTheory", sql.Int, Number(oldLesson.MaLop || 0))
        .input("excludeScheduleIdTheory", sql.Int, scheduleId)
        .input("semesterStartTheory", sql.DateTime, semesterStart)
        .input("semesterEndTheory", sql.DateTime, semesterEnd)
        .query(`
          SELECT ld.NgayDay, ld.Buoi, m.TenMon, m.LoaiMon
          FROM LICH_DAY ld
          LEFT JOIN MON m ON m.MaMon = ld.MaMon
          WHERE ld.MaLop = @maLopTheory
            AND ld.MaLD <> @excludeScheduleIdTheory
            AND ld.NgayDay >= @semesterStartTheory
            AND ld.NgayDay <= @semesterEndTheory
            AND UPPER(LTRIM(RTRIM(ISNULL(CAST(ld.TrangThai AS NVARCHAR(50)), '')))) NOT IN (
              N'ĐÃ XÓA', N'DA XOA', N'DELETED', N'HỦY', N'HUY', N'CANCELLED', N'CANCELED',
              N'TẠM NGƯNG', N'TAM NGUNG', N'TẠM DỪNG', N'TAM DUNG', N'PAUSED'
            )
        `)

      const theoryMoments = (theoryRowsResult.recordset || [])
        .filter((row: any) => getBaseCourseKey(row.TenMon) === targetBaseCourseKey)
        .filter((row: any) => !isPracticeCourseType(row.LoaiMon, row.TenMon))
        .map((row: any) => {
          const date = new Date(String(row.NgayDay || ""))
          if (Number.isNaN(date.getTime())) return null
          const dateIso = formatIsoDateLocal(date)
          const range = resolvePeriodRange(String(row.Buoi || "").trim())
          return { dateIso, periodEnd: range.end }
        })
        .filter((item: any): item is { dateIso: string; periodEnd: number } => Boolean(item))

      const newDateIso = formatIsoDateLocal(newDateOnly)
      const violatesTheoryBeforePractice = theoryMoments.some((theory: { dateIso: string; periodEnd: number }) =>
        compareDatePeriod(newDateIso, periodRange.start, theory.dateIso, theory.periodEnd) <= 0
      )

      if (violatesTheoryBeforePractice) {
        await transaction.rollback()
        return NextResponse.json({
          success: false,
          error: "Không thể dời lịch thực hành lên trước lịch lý thuyết của cùng môn",
        }, { status: 409 })
      }
    }

    await new sql.Request(transaction)
      .input("scheduleId", sql.Int, scheduleId)
      .input("pausedStatus", sql.NVarChar(50), "Tạm ngưng")
      .query(`
        UPDATE LICH_DAY
        SET TrangThai = @pausedStatus
        WHERE MaLD = @scheduleId
      `)

    const maxResult = await new sql.Request(transaction).query(`SELECT ISNULL(MAX(MaLD), 0) AS maxId FROM LICH_DAY`)
    const nextMaLD = Number(maxResult.recordset?.[0]?.maxId || 0) + 1
    const newWeek = getWeekOfYear(newDate)

    await new sql.Request(transaction)
      .input("MaLD", sql.Int, nextMaLD)
      .input("MaLop", sql.Int, Number(oldLesson.MaLop || 0))
      .input("MaPhong", sql.Int, Number(oldLesson.MaPhong || 0))
      .input("MaGV", sql.Int, Number(oldLesson.MaGV || 0))
      .input("MaMon", sql.Int, Number(oldLesson.MaMon || 0))
      .input("NgayDay", sql.DateTime, newDate)
      .input("SoTietDay", sql.Int, Number(oldLesson.SoTietDay || 0))
      .input("TrangThai", sql.NVarChar(50), "Đang diễn ra")
      .input("HocKyDay", sql.VarChar(50), String(oldLesson.HocKyDay || "").trim())
      .input("Buoi", sql.NVarChar(50), targetSession)
      .input("Tuan", sql.NVarChar(50), `Tuần ${newWeek || ""}`.trim())
      .query(`
        INSERT INTO LICH_DAY (MaLD, MaLop, MaPhong, MaGV, MaMon, NgayDay, SoTietDay, TrangThai, HocKyDay, Buoi, Tuan)
        VALUES (@MaLD, @MaLop, @MaPhong, @MaGV, @MaMon, @NgayDay, @SoTietDay, @TrangThai, @HocKyDay, @Buoi, @Tuan)
      `)

    await transaction.commit()

    return NextResponse.json({
      success: true,
      data: {
        pausedScheduleId: scheduleId,
        newScheduleId: nextMaLD,
        newDate: formatIsoDateLocal(newDate),
        newSession: targetSession,
      },
    })
  } catch (error) {
    if (transaction) {
      try {
        await transaction.rollback()
      } catch {
        // ignore rollback error
      }
    }
    console.error("Error rescheduling timetable:", error)
    return NextResponse.json({ success: false, error: "Lỗi khi điều chỉnh lịch dạy" }, { status: 500 })
  } finally {
    if (pool) await pool.close()
  }
}
