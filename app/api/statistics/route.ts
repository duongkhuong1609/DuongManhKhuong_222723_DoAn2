import { NextRequest, NextResponse } from "next/server"
import { getMssqlPool } from "@/lib/mssql"
import { MSSQL_DB_CONFIG } from "@/lib/db-config"

const sql = require("mssql")

const STATS_REQUEST_TIMEOUT_MS = 60000
const STATS_CACHE_TTL_MS = 30000

type StatsCacheEntry = {
  expiresAt: number
  payload: any
}

const globalStatsCache = globalThis as typeof globalThis & {
  __statisticsCache?: Map<string, StatsCacheEntry>
}

if (!globalStatsCache.__statisticsCache) {
  globalStatsCache.__statisticsCache = new Map<string, StatsCacheEntry>()
}

const statisticsCache = globalStatsCache.__statisticsCache

const dbConfig = {
  ...MSSQL_DB_CONFIG,
  requestTimeout: STATS_REQUEST_TIMEOUT_MS,
}

const ACTIVE_SCHEDULE_SQL = `
  UPPER(LTRIM(RTRIM(ISNULL(CAST(ld.TrangThai AS NVARCHAR(50)), ''))))
  NOT IN (
    N'ĐÃ XÓA', N'DA XOA', N'DELETED', N'HỦY', N'HUY', N'CANCELLED', N'CANCELED',
    N'TẠM NGƯNG', N'TAM NGUNG', N'TẠM DỪNG', N'TAM DUNG', N'PAUSED'
  )
`

const isPausedScheduleStatus = (value: unknown) => {
  const normalized = String(value || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
  return normalized === "TAM DUNG" || normalized === "TAM NGUNG" || normalized === "PAUSED"
}

const normalizeSession = (value: unknown) => String(value || "").trim().toLowerCase().replace(/\s+/g, "")

const normalizeWeekday = (value: unknown) => {
  const text = String(value || "").trim().toLowerCase().replace(/\s+/g, "")
  if (!text) return ""

  if (["2", "thu2", "thứ2", "monday", "mon"].some((item) => text.includes(item))) return "2"
  if (["3", "thu3", "thứ3", "tuesday", "tue"].some((item) => text.includes(item))) return "3"
  if (["4", "thu4", "thứ4", "wednesday", "wed"].some((item) => text.includes(item))) return "4"
  if (["5", "thu5", "thứ5", "thursday", "thu"].some((item) => text.includes(item))) return "5"
  if (["6", "thu6", "thứ6", "friday", "fri"].some((item) => text.includes(item))) return "6"
  if (["7", "thu7", "thứ7", "saturday", "sat"].some((item) => text.includes(item))) return "7"
  if (["cn", "chunhat", "chủnhật", "sunday", "sun"].some((item) => text.includes(item))) return "cn"
  return ""
}

const dayLabelFromDate = (value: unknown) => {
  const date = new Date(String(value || ""))
  if (Number.isNaN(date.getTime())) return ""
  const jsDay = date.getDay()
  if (jsDay === 0) return "CN"
  return `Thứ ${jsDay + 1}`
}

const dayIndexFromLabel = (label: string) => {
  if (label === "CN") return 7
  const n = Number(label.replace("Thứ ", ""))
  return Number.isFinite(n) ? n - 1 : 99
}

type ConflictScheduleBrief = {
  id: string
  className: string
  courseName: string
  instructorName: string
  roomName: string
  date: string
  session: string
  status: string
}

type ConflictGroup = {
  key: string
  date: string
  session: string
  schedules: ConflictScheduleBrief[]
}

const toIsoDate = (value: unknown) => {
  const date = new Date(String(value || ""))
  if (Number.isNaN(date.getTime())) return ""
  return date.toISOString().slice(0, 10)
}

const formatDateVi = (value: unknown) => {
  const date = new Date(String(value || ""))
  if (Number.isNaN(date.getTime())) return ""
  return date.toLocaleDateString("vi-VN")
}

const toConflictBrief = (row: any): ConflictScheduleBrief => ({
  id: String(row.MaLD || "").trim(),
  className: String(row.TenLop || row.MaLop || "").trim(),
  courseName: String(row.TenMon || row.MaMon || "").trim(),
  instructorName: String(row.TenGV || row.MaGV || "").trim(),
  roomName: String(row.TenPhong || row.MaPhong || "").trim(),
  date: formatDateVi(row.NgayDay),
  session: String(row.Buoi || "").trim(),
  status: String(row.TrangThai || "").trim(),
})

const toConflictGroups = (slotMap: Map<string, any[]>): ConflictGroup[] => {
  const groups: ConflictGroup[] = []

  for (const [key, rows] of slotMap.entries()) {
    if (!rows || rows.length < 2) continue
    const sample = rows[0]
    groups.push({
      key,
      date: formatDateVi(sample?.NgayDay),
      session: String(sample?.Buoi || "").trim(),
      schedules: rows.map((row) => toConflictBrief(row)),
    })
  }

  return groups.sort((a, b) => {
    const aDate = new Date(a.schedules?.[0]?.date || "").getTime()
    const bDate = new Date(b.schedules?.[0]?.date || "").getTime()
    if (Number.isFinite(aDate) && Number.isFinite(bDate) && aDate !== bDate) return aDate - bDate
    return a.session.localeCompare(b.session, "vi")
  })
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const requestedYear = Number(searchParams.get("year") || 0)
    const cacheKey = `year:${Number.isFinite(requestedYear) ? requestedYear : 0}`
    const cached = statisticsCache.get(cacheKey)

    if (cached && cached.expiresAt > Date.now()) {
      return NextResponse.json(cached.payload)
    }

    const pool = await getMssqlPool(dbConfig)

    const currentYear = new Date().getFullYear()
    const yearSeedResult = await pool.request().query(`
      SELECT TOP 1
        TRY_CONVERT(INT, LEFT(LTRIM(RTRIM(ISNULL(l.NienKhoa, ''))), CHARINDEX('-', LTRIM(RTRIM(ISNULL(l.NienKhoa, ''))) + '-') - 1))
        + TRY_CONVERT(INT, l.Nam) - 1 AS AcademicYearStart
      FROM LOP l
      WHERE TRY_CONVERT(INT, l.Nam) BETWEEN 1 AND 4
        AND UPPER(LTRIM(RTRIM(ISNULL(CAST(l.TrangThai AS NVARCHAR(50)), '')))) NOT IN (N'ĐÃ TỐT NGHIỆP', N'DA TOT NGHIEP')
      ORDER BY AcademicYearStart DESC
    `)

    const inferredAcademicYearStart = Number(yearSeedResult.recordset?.[0]?.AcademicYearStart || 0)
    const academicYearStart = Number.isFinite(inferredAcademicYearStart) && inferredAcademicYearStart > 1900
      ? inferredAcademicYearStart
      : currentYear - 1

    const selectableYears = [academicYearStart, academicYearStart + 1]
    const yearDistributionResult = await pool.request()
      .input("year0", sql.Int, selectableYears[0])
      .input("year1", sql.Int, selectableYears[1])
      .query(`
        SELECT YEAR(ld.NgayDay) AS Nam, COUNT(1) AS SoLich
        FROM LICH_DAY ld
        WHERE YEAR(ld.NgayDay) IN (@year0, @year1)
          AND ${ACTIVE_SCHEDULE_SQL}
        GROUP BY YEAR(ld.NgayDay)
      `)

    const countByYear = new Map<number, number>()
    for (const row of yearDistributionResult.recordset || []) {
      const year = Number(row.Nam || 0)
      const count = Number(row.SoLich || 0)
      if (Number.isFinite(year) && Number.isFinite(count)) {
        countByYear.set(year, count)
      }
    }

    let selectedYear = requestedYear
    if (!selectableYears.includes(selectedYear)) {
      selectedYear = selectableYears[0]
      let maxCount = -1
      for (const year of selectableYears) {
        const count = countByYear.get(year) || 0
        if (count > maxCount) {
          maxCount = count
          selectedYear = year
        }
      }
    }

    const scheduleRowsResult = await pool.request().input("selectedYear", sql.Int, selectedYear).query(`
      SELECT
        ld.MaLD,
        ld.MaGV,
        ld.MaPhong,
        ld.MaMon,
        ld.MaLop,
        ld.NgayDay,
        ld.Buoi,
        ld.SoTietDay,
        ld.TrangThai,
        l.TenLop,
        mon.TenMon,
        gv.TenGV,
        n.TenNganh,
        phong.TenPhong
      FROM LICH_DAY ld
      LEFT JOIN GIANG_VIEN gv ON gv.MaGV = ld.MaGV
      LEFT JOIN LOP l ON l.MaLop = ld.MaLop
      LEFT JOIN MON mon ON mon.MaMon = ld.MaMon
      LEFT JOIN NGANH n ON n.MaNganh = l.MaNganh
      LEFT JOIN PHONG phong ON phong.MaPhong = ld.MaPhong
      WHERE YEAR(ld.NgayDay) = @selectedYear
        AND ${ACTIVE_SCHEDULE_SQL}
    `)

    const scheduleRows = scheduleRowsResult.recordset || []
    const totalSchedules = scheduleRows.length

    const [instructorCountResult, roomCountResult, classCountResult, majorCountResult] = await Promise.all([
      pool.request().query(`
        SELECT COUNT(1) AS Cnt
        FROM GIANG_VIEN gv
        WHERE UPPER(LTRIM(RTRIM(ISNULL(CAST(gv.TrangThai AS NVARCHAR(50)), '')))) NOT IN (N'VÔ HIỆU HÓA', N'VO HIEU HOA')
      `),
      pool.request().query(`SELECT COUNT(1) AS Cnt FROM PHONG`),
      pool.request().query(`
        SELECT COUNT(1) AS Cnt
        FROM LOP l
        WHERE TRY_CONVERT(INT, l.Nam) BETWEEN 1 AND 4
          AND UPPER(LTRIM(RTRIM(ISNULL(CAST(l.TrangThai AS NVARCHAR(50)), '')))) NOT IN (N'ĐÃ TỐT NGHIỆP', N'DA TOT NGHIEP')
      `),
      pool.request().query(`SELECT COUNT(1) AS Cnt FROM NGANH`),
    ])

    const totalPeriods = scheduleRows.reduce((sum: number, row: any) => sum + Number(row.SoTietDay || 0), 0)

    const instructorMap = new Map<string, { name: string; periods: number; sessions: number }>()
    for (const row of scheduleRows) {
      const key = String(row.MaGV || "")
      if (!key) continue
      const current = instructorMap.get(key) || {
        name: String(row.TenGV || `GV ${key}`).trim(),
        periods: 0,
        sessions: 0,
      }
      current.periods += Number(row.SoTietDay || 0)
      current.sessions += 1
      instructorMap.set(key, current)
    }

    const teacherLoad = Array.from(instructorMap.entries())
      .map(([id, item]) => ({
        id,
        name: item.name,
        periods: item.periods,
        sessions: item.sessions,
        overload: item.periods > 300,
      }))
      .sort((a, b) => b.periods - a.periods)

    const roomMap = new Map<string, { name: string; usedSessions: number }>()
    for (const row of scheduleRows) {
      const key = String(row.MaPhong || "")
      if (!key) continue
      const current = roomMap.get(key) || {
        name: String(row.TenPhong || `P${key}`).trim(),
        usedSessions: 0,
      }
      current.usedSessions += 1
      roomMap.set(key, current)
    }

    const roomUsage = Array.from(roomMap.entries())
      .map(([id, item]) => ({
        id,
        name: item.name,
        usedSessions: item.usedSessions,
        usageRate: totalSchedules > 0 ? Math.round((item.usedSessions / totalSchedules) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.usedSessions - a.usedSessions)

    const allRoomsResult = await pool.request().query(`SELECT MaPhong, TenPhong FROM PHONG`)
    const roomEverScheduledResult = await pool.request().query(`
      SELECT DISTINCT CAST(ld.MaPhong AS NVARCHAR(50)) AS MaPhong
      FROM LICH_DAY ld
      WHERE ld.MaPhong IS NOT NULL
    `)
    const roomIdsWithSchedule = new Set(
      (roomEverScheduledResult.recordset || [])
        .map((row: any) => String(row.MaPhong || "").trim())
        .filter(Boolean)
    )
    const unusedRooms = (allRoomsResult.recordset || [])
      .map((row: any) => ({
        id: String(row.MaPhong || "").trim(),
        name: String(row.TenPhong || `P${row.MaPhong}`).trim(),
      }))
      .filter((item: { id: string; name: string }) => item.id && !roomIdsWithSchedule.has(item.id))

    const dayMap = new Map<string, number>()
    for (const row of scheduleRows) {
      const label = dayLabelFromDate(row.NgayDay)
      if (!label) continue
      dayMap.set(label, (dayMap.get(label) || 0) + 1)
    }
    const dailySchedules = Array.from(dayMap.entries())
      .map(([day, count]) => ({ day, count }))
      .sort((a, b) => dayIndexFromLabel(a.day) - dayIndexFromLabel(b.day))

    const majorMap = new Map<string, number>()
    for (const row of scheduleRows) {
      const majorName = String(row.TenNganh || "Chưa xác định").trim() || "Chưa xác định"
      majorMap.set(majorName, (majorMap.get(majorName) || 0) + 1)
    }
    const byMajor = Array.from(majorMap.entries())
      .map(([majorName, schedules]) => ({ majorName, schedules }))
      .sort((a, b) => b.schedules - a.schedules)

    const classSlotSet = new Set<string>()
    const roomSlotSet = new Set<string>()
    const teachingSlotSet = new Set<string>()
    const subjectSlotSet = new Set<string>()
    const classSlotMap = new Map<string, any[]>()
    const roomSlotMap = new Map<string, any[]>()
    const teachingSlotMap = new Map<string, any[]>()
    const subjectSlotMap = new Map<string, any[]>()
    let classConflicts = 0
    let roomConflicts = 0
    let teachingConflicts = 0
    let subjectConflicts = 0

    for (const row of scheduleRows) {
      const date = new Date(String(row.NgayDay || ""))
      if (Number.isNaN(date.getTime())) continue
      const dateKey = date.toISOString().slice(0, 10)
      const sessionKey = normalizeSession(row.Buoi)
      if (!sessionKey) continue

      const classKey = `${dateKey}|${sessionKey}|${String(row.MaLop || "")}`
      if (String(row.MaLop || "").trim()) {
        const classRows = classSlotMap.get(classKey) || []
        classRows.push(row)
        classSlotMap.set(classKey, classRows)
        if (classSlotSet.has(classKey)) classConflicts += 1
        else classSlotSet.add(classKey)
      }

      const roomKey = `${dateKey}|${sessionKey}|${String(row.MaPhong || "")}`
      if (String(row.MaPhong || "").trim()) {
        const roomRows = roomSlotMap.get(roomKey) || []
        roomRows.push(row)
        roomSlotMap.set(roomKey, roomRows)
        if (roomSlotSet.has(roomKey)) roomConflicts += 1
        else roomSlotSet.add(roomKey)
      }

      const isPaused = isPausedScheduleStatus(row.TrangThai)
      const teachingKey = `${dateKey}|${sessionKey}|${String(row.MaGV || "")}`
      if (!isPaused && String(row.MaGV || "").trim()) {
        const teachingRows = teachingSlotMap.get(teachingKey) || []
        teachingRows.push(row)
        teachingSlotMap.set(teachingKey, teachingRows)
        if (teachingSlotSet.has(teachingKey)) teachingConflicts += 1
        else teachingSlotSet.add(teachingKey)
      }

      const subjectKey = `${dateKey}|${sessionKey}|${String(row.MaLop || "")}|${String(row.MaMon || "")}`
      if (String(row.MaLop || "").trim() && String(row.MaMon || "").trim()) {
        const subjectRows = subjectSlotMap.get(subjectKey) || []
        subjectRows.push(row)
        subjectSlotMap.set(subjectKey, subjectRows)
        if (subjectSlotSet.has(subjectKey)) subjectConflicts += 1
        else subjectSlotSet.add(subjectKey)
      }
    }

    const classConflictDetails = toConflictGroups(classSlotMap)
    const roomConflictDetails = toConflictGroups(roomSlotMap)
    const teachingConflictDetails = toConflictGroups(teachingSlotMap)
    const subjectConflictDetails = toConflictGroups(subjectSlotMap)

    const preferenceResult = await pool.request().query(`
      SELECT MaGV, ThuTrongTuan, TietDay, MucDoUuTien
      FROM NGUYEN_VONG_THOI_GIAN
      WHERE MucDoUuTien IN (1, 2, 3)
    `)

    const preferenceRows = preferenceResult.recordset || []
    const preferenceSet = new Set<string>()
    for (const row of preferenceRows) {
      const dayKey = normalizeWeekday(row.ThuTrongTuan)
      const sessionKey = normalizeSession(row.TietDay)
      const gvKey = String(row.MaGV || "").trim()
      if (!gvKey || !dayKey || !sessionKey) continue
      preferenceSet.add(`${gvKey}|${dayKey}|${sessionKey}`)
    }

    let matchedPreferences = 0
    let evaluatedSchedules = 0
    for (const row of scheduleRows) {
      const gvKey = String(row.MaGV || "").trim()
      if (!gvKey) continue

      const date = new Date(String(row.NgayDay || ""))
      if (Number.isNaN(date.getTime())) continue

      const jsDay = date.getDay()
      const dayKey = jsDay === 0 ? "cn" : String(jsDay + 1)
      const sessionKey = normalizeSession(row.Buoi)
      if (!sessionKey) continue

      evaluatedSchedules += 1
      if (preferenceSet.has(`${gvKey}|${dayKey}|${sessionKey}`)) {
        matchedPreferences += 1
      }
    }

    const preferenceFulfillmentRate = evaluatedSchedules > 0
      ? Math.round((matchedPreferences / evaluatedSchedules) * 1000) / 10
      : 0

    const payload = {
      success: true,
      data: {
        filters: {
          academicYearStart,
          selectableYears,
          selectedYear,
        },
        overview: {
          totalSchedules,
          totalPeriods,
          totalInstructors: Number(instructorCountResult.recordset?.[0]?.Cnt || 0),
          totalRooms: Number(roomCountResult.recordset?.[0]?.Cnt || 0),
          totalClasses: Number(classCountResult.recordset?.[0]?.Cnt || 0),
          totalMajors: Number(majorCountResult.recordset?.[0]?.Cnt || 0),
          classConflicts,
          roomConflicts,
          teachingConflicts,
          subjectConflicts,
          totalConflicts: classConflicts + roomConflicts + teachingConflicts + subjectConflicts,
          preferenceFulfillmentRate,
        },
        teacherLoad,
        roomUsage,
        unusedRooms,
        dailySchedules,
        byMajor,
        conflictDetails: {
          class: classConflictDetails,
          room: roomConflictDetails,
          teaching: teachingConflictDetails,
          subject: subjectConflictDetails,
        },
      },
    }

    statisticsCache.set(cacheKey, {
      expiresAt: Date.now() + STATS_CACHE_TTL_MS,
      payload,
    })

    return NextResponse.json(payload)
  } catch (error) {
    console.error("Error fetching statistics:", error)
    return NextResponse.json({ success: false, error: "Lỗi khi tải thống kê" }, { status: 500 })
  }
}
