import { NextRequest, NextResponse } from "next/server"

type StepStatus = "pending" | "running" | "completed" | "error"
type JobStatus = "running" | "completed" | "error"

type JobStep = {
  name: string
  status: StepStatus
  message?: string
}

type GenerationPayload = {
  majorId: string
  semesterIds: string[]
  settings: {
    avoidConflicts: boolean
    optimizeRooms: boolean
    balanceWorkload: boolean
    respectPreferences: boolean
  }
  replaceExisting: boolean
}

type JobState = {
  id: string
  status: JobStatus
  progress: number
  steps: JobStep[]
  startedAt: string
  finishedAt?: string
  error?: string
  result?: {
    createdRows: number
    unassignedTasks: number
    totalTasks: number
    warnings: string[]
  }
}

const sql = require("mssql")

const dbConfig = {
  server: "localhost",
  instanceName: "SQLEXPRESS",
  database: "LAP_LICH_TU_DONG",
  authentication: { type: "default", options: { userName: "sa", password: "123456" } },
  options: { encrypt: false, trustServerCertificate: true },
  requestTimeout: 120000,
}

const ONGOING_STATUS_SQL = `(
  LTRIM(RTRIM(ISNULL(CAST(hk.TrangThai AS NVARCHAR(50)), ''))) = N'2'
  OR UPPER(
    REPLACE(
      REPLACE(
        LTRIM(RTRIM(ISNULL(CAST(hk.TrangThai AS NVARCHAR(50)), ''))),
        N'Đ',
        N'D'
      ),
      N'đ',
      N'd'
    ) COLLATE Latin1_General_100_CI_AI
  ) = N'DANG DIEN RA'
)`

type GlobalWithJobs = typeof globalThis & {
  __scheduleGenerationJobs?: Map<string, JobState>
}

const globalJobs = (globalThis as GlobalWithJobs)
if (!globalJobs.__scheduleGenerationJobs) {
  globalJobs.__scheduleGenerationJobs = new Map<string, JobState>()
}
const jobs = globalJobs.__scheduleGenerationJobs

const MOJIBAKE_HINT_REGEX = /[ÃÂÄá»�]/

const decodeLatin1AsUtf8 = (input: string) => {
  if (!input) return input

  const bytes = new Uint8Array(input.length)
  for (let i = 0; i < input.length; i += 1) {
    const code = input.charCodeAt(i)
    if (code > 255) {
      return input
    }
    bytes[i] = code
  }

  return new TextDecoder("utf-8").decode(bytes)
}

const repairMojibakeText = (value: unknown) => {
  let current = String(value ?? "")
  if (!current || !MOJIBAKE_HINT_REGEX.test(current)) return current

  // Some strings were encoded more than once, so try decode in short rounds.
  for (let i = 0; i < 3; i += 1) {
    const next = decodeLatin1AsUtf8(current)
    if (!next || next === current) break
    current = next
    if (!MOJIBAKE_HINT_REGEX.test(current)) break
  }

  return current
}

const sanitizeJobForResponse = (job: JobState): JobState => ({
  ...job,
  steps: job.steps.map((step) => ({
    ...step,
    name: repairMojibakeText(step.name),
    message: step.message !== undefined ? repairMojibakeText(step.message) : step.message,
  })),
  error: job.error !== undefined ? repairMojibakeText(job.error) : job.error,
  result: job.result
    ? {
        ...job.result,
        warnings: (job.result.warnings || []).map((warning) => repairMojibakeText(warning)),
      }
    : job.result,
})

const getTableColumns = async (pool: any, tableName: string): Promise<Set<string>> => {
  const result = await pool
    .request()
    .input("tableName", tableName)
    .query(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = @tableName
    `)

  return new Set((result.recordset || []).map((row: any) => String(row.COLUMN_NAME || "").toLowerCase()))
}

const buildDefaultSteps = (): JobStep[] => [
  { name: "Tải dữ liệu học kỳ, lớp, môn, giảng viên", status: "pending" },
  { name: "Phân tích tác vụ và kiểm tra ràng buộc", status: "pending" },
  { name: "Sinh lịch và tối ưu phân công", status: "pending" },
  { name: "Lưu kết quả lập lịch", status: "pending" },
  { name: "Hoàn tất", status: "pending" },
]

const updateStep = (job: JobState, stepIndex: number, status: StepStatus, message?: string, progress?: number) => {
  job.steps = job.steps.map((step, index) => {
    if (index !== stepIndex) return step
    return {
      ...step,
      name: repairMojibakeText(step.name),
      status,
      message: message !== undefined ? repairMojibakeText(message) : step.message,
    }
  })

  if (typeof progress === "number") {
    job.progress = Math.max(0, Math.min(100, progress))
  }
}

const dayNameToSqlWeekDay: Record<number, number> = {
  1: 2,
  2: 3,
  3: 4,
  4: 5,
  5: 6,
  6: 7,
  0: 1,
}

type SemesterRow = {
  MaHK: number
  TenHK: string
  NamHK: string | number | null
  TuNgay: Date | string | null
  DenNgay: Date | string | null
  MaNganhHK?: string | number | null
  TenNganhHK?: string | null
}

type CourseRow = {
  MaHK: number
  MaMon: number
  TenMon: string
  SoTiet: number | null
  LoaiMon?: string | null
}

type ClassRow = {
  MaLop: number
  TenLop: string
  Nam: number | null
  MaNganh?: string | number | null
  SiSo?: number | null
}

type InstructorRow = {
  MaGV: number
  TenGV: string
}

type RoomRow = {
  MaPhong: number
  TenPhong: string
  LoaiPhong?: string | null
  SucChua?: number | null
}

type TimePreference = {
  maGV: number
  thuTrongTuan: string
  tietDay: string
  mucDoUuTien: number
}

type Task = {
  taskId: string
  maLop: number
  maMon: number
  maHK: number
  hocKyDay: string
  soTietDay: number
  chunkIndex: number
  courseName: string
  isInternship: boolean
  isPractice: boolean
  baseCourseKey: string
  courseRunKey: string
  preferredRoomType: "Lý thuyết" | "Thực hành"
  targetWeekIndex: number
  maxMeetingsPerWeek: number
}

type Assignment = {
  maLop: number
  maMon: number
  maGV: number
  maPhong: number
  ngayDay: Date
  soTietDay: number
  hocKyDay: string
  buoi: string
  tuan: string
}

const toNumber = (value: unknown, fallback = 0) => {
  const num = Number(value)
  return Number.isFinite(num) ? num : fallback
}

const parseClassYear = (value: unknown) => {
  const num = Number(String(value ?? "").trim())
  return Number.isFinite(num) ? num : null
}

const parseSemesterNumber = (value: unknown) => {
  const raw = String(value || "")
  const match = raw.match(/\d+/)
  if (!match) return null
  const num = Number(match[0])
  return Number.isFinite(num) ? num : null
}

const normalizeDateOnly = (value: Date) => {
  const date = new Date(value)
  date.setHours(0, 0, 0, 0)
  return date
}

const addMonthsSafe = (baseDate: Date, months: number) => {
  const date = new Date(baseDate)
  const originalDay = date.getDate()
  date.setMonth(date.getMonth() + Math.max(0, months))
  if (date.getDate() < originalDay) {
    date.setDate(0)
  }
  return date
}

const resolveSemesterMonthRange = (semesterName: unknown, classYear: unknown, semesterCountByYear: Map<number, number>) => {
  const year = parseClassYear(classYear)
  const countInYear = year !== null ? semesterCountByYear.get(year) || 0 : 0
  const semesterNumber = parseSemesterNumber(semesterName)

  // Year with 3 terms: each term should be in [3, 5] months.
  if (countInYear >= 3 || semesterNumber === 3) {
    return { minMonths: 3, maxMonths: 5 }
  }

  // Year with terms 1-2: each term should be in [4, 6] months.
  return { minMonths: 4, maxMonths: 6 }
}

const buildEffectiveSemesterWindow = (semester: SemesterRow, semesterCountByYear: Map<number, number>) => {
  const now = normalizeDateOnly(new Date())
  const startRaw = semester.TuNgay ? new Date(semester.TuNgay) : now
  const start = Number.isFinite(startRaw.getTime()) ? normalizeDateOnly(startRaw) : now

  const { minMonths, maxMonths } = resolveSemesterMonthRange(semester.TenHK, semester.NamHK, semesterCountByYear)
  const minEnd = addMonthsSafe(start, minMonths)
  const maxEnd = addMonthsSafe(start, maxMonths)

  const endRaw = semester.DenNgay ? new Date(semester.DenNgay) : maxEnd
  const parsedEnd = Number.isFinite(endRaw.getTime()) ? normalizeDateOnly(endRaw) : maxEnd

  // Clamp to the target range requested by business rule.
  let end = parsedEnd
  if (end < minEnd) end = minEnd
  if (end > maxEnd) end = maxEnd

  return { start, end }
}

const normalizeVietnameseText = (value: unknown) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u2013\u2014]/g, "-")
    .toLowerCase()
    .trim()

const isThesisCourse = (courseName: unknown) => {
  const normalized = normalizeVietnameseText(courseName)
  if (!normalized) return false

  return (
    normalized.includes("khoa luan tot nghiep") ||
    normalized.includes("do an tot nghiep") ||
    normalized.includes("luan van tot nghiep")
  )
}

const isFinalInternshipCourse = (courseName: unknown) => {
  const normalized = normalizeVietnameseText(courseName)
  return normalized.includes("thuc tap cuoi khoa") || normalized.includes("thuc tap tot nghiep")
}

const isProjectCourse = (courseName: unknown) => {
  const normalized = normalizeVietnameseText(courseName)
  return normalized.includes("do an")
}

const isPracticeCourse = (courseName: unknown) => {
  const normalized = normalizeVietnameseText(courseName)
  // Detect practice suffix forms: "-Thực hành", "(Thực hành)", "Thực hành 1", ...
  return /(?:[-_\s(\[]+)?thuc hanh(?:\s*\d+)?\s*[)\]]?$/.test(normalized)
}

const isPracticeCourseType = (courseType: unknown, courseName: unknown) => {
  const normalizedType = normalizeVietnameseText(courseType)
  if (normalizedType.includes("thuc hanh")) return true
  return isPracticeCourse(courseName)
}

const resolvePreferredRoomType = (courseType: unknown, courseName: unknown): "Lý thuyết" | "Thực hành" => {
  return isPracticeCourseType(courseType, courseName) ? "Thực hành" : "Lý thuyết"
}

const roomMatchesPreferredType = (roomType: unknown, preferredType: "Lý thuyết" | "Thực hành") => {
  const normalizedRoomType = normalizeVietnameseText(roomType)
  if (!normalizedRoomType) return true
  if (preferredType === "Thực hành") return normalizedRoomType.includes("thuc hanh")
  return normalizedRoomType.includes("ly thuyet")
}

const rotatePool = <T,>(items: T[], maxCount: number, seed: number) => {
  if (items.length <= maxCount) return items

  const start = Math.abs(seed) % items.length
  const result: T[] = []
  for (let i = 0; i < Math.min(items.length, maxCount); i += 1) {
    result.push(items[(start + i) % items.length])
  }
  return result
}

const getBaseCourseKey = (courseName: unknown) => {
  const normalized = normalizeVietnameseText(courseName)
  return normalized
    .replace(/(?:[-_\s(\[]+)?thuc hanh(?:\s*\d+)?\s*[)\]]?$/, "")
    .replace(/(?:[-_\s(\[]+)?ly thuyet(?:\s*\d+)?\s*[)\]]?$/, "")
    .replace(/(?:[-_\s(\[]+)?li thuyet(?:\s*\d+)?\s*[)\]]?$/, "")
    .replace(/[-_\s()\[\]]+$/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

const getTheoryPracticePairKey = (task: Pick<Task, "maLop" | "maHK" | "baseCourseKey">) => {
  // Pair theory-practice only within the same class and semester.
  return `${task.maLop}_${task.maHK}_${task.baseCourseKey}`
}

const isExcludedFromScheduleCourse = (courseName: unknown) => {
  return isThesisCourse(courseName) || isProjectCourse(courseName) || isFinalInternshipCourse(courseName)
}

type Candidate = {
  assignment: Assignment
  weekIndex: number
  staticScore: number
  weekDistance: number
  teacherKeys: string[]
  classKeys: string[]
  roomKeys: string[]
}

const resolveSlotPeriods = (label: string) => {
  const match = String(label || "").match(/(\d+)\s*-\s*(\d+)/)
  if (!match) return [] as number[]
  const start = Number(match[1])
  const end = Number(match[2])
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) return [] as number[]
  return Array.from({ length: end - start + 1 }, (_, index) => start + index)
}

const buildChunkPlan = (totalPeriods: number) => {
  const plan: number[] = []
  let remaining = Math.max(0, totalPeriods)

  while (remaining > 0) {
    if (remaining % 5 === 0 || remaining > 7) {
      plan.push(5)
      remaining -= 5
      continue
    }

    if (remaining >= 3) {
      plan.push(3)
      remaining -= 3
      continue
    }

    if (plan.length > 0) {
      plan[plan.length - 1] += remaining
      remaining = 0
      continue
    }

    plan.push(remaining)
    remaining = 0
  }

  return plan.filter((value) => value > 0)
}

const SLOT_OPTIONS: Array<{ label: string; preferenceSession: string }> = [
  { label: "1-3", preferenceSession: "Sáng" },
  { label: "4-6", preferenceSession: "Sáng" },
  { label: "1-5", preferenceSession: "Sáng" },
  { label: "7-9", preferenceSession: "Chiều" },
  { label: "10-12", preferenceSession: "Tối" },
  { label: "7-11", preferenceSession: "Chiều" },
]

const RESCUE_SLOT_OPTIONS = SLOT_OPTIONS.filter((slot) => slot.preferenceSession === "Sáng" || slot.preferenceSession === "Chiều")

const toWeekDayIndex = (dateValue: Date) => {
  const day = dateValue.getDay()
  return day === 0 ? 7 : day
}

const buildWeekStarts = (start: Date, end: Date) => {
  const startDate = new Date(start)
  const day = startDate.getDay()
  const diffToMonday = day === 0 ? -6 : 1 - day
  startDate.setDate(startDate.getDate() + diffToMonday)
  startDate.setHours(0, 0, 0, 0)

  const weeks: Date[] = []
  const cursor = new Date(startDate)

  const maxWeeks = 24
  while (cursor <= end && weeks.length < maxWeeks) {
    weeks.push(new Date(cursor))
    cursor.setDate(cursor.getDate() + 7)
  }

  if (weeks.length === 0) {
    weeks.push(new Date(startDate))
  }

  return weeks
}

const buildTargetWeekIndexes = (
  weekCount: number,
  chunkCount: number,
  isPractice: boolean,
  balanceWorkload: boolean,
) => {
  const safeWeekCount = Math.max(1, weekCount)
  const safeChunkCount = Math.max(1, chunkCount)
  const startIndex = (() => {
    if (!isPractice) return 0
    if (safeWeekCount <= 2) return 0
    if (!balanceWorkload) return Math.min(safeWeekCount - 1, Math.max(1, Math.floor(safeWeekCount * 0.35)))
    return Math.min(safeWeekCount - 1, Math.max(1, Math.floor(safeWeekCount * 0.55)))
  })()

  // Compact span: distribute evenly but do not force stretching until semester end.
  const desiredMeetingsPerWeek = balanceWorkload
    ? (isPractice ? 1.55 : 1.6)
    : (isPractice ? 2.6 : 2.8)
  const denseSpanWeeks = Math.ceil(safeChunkCount / desiredMeetingsPerWeek)
  const minSpanWeeks = balanceWorkload
    ? Math.max(2, Math.min(safeWeekCount, denseSpanWeeks))
    : Math.max(1, Math.min(safeWeekCount, denseSpanWeeks))
  const endIndex = Math.max(startIndex, Math.min(safeWeekCount - 1, startIndex + minSpanWeeks - 1))
  const span = Math.max(0, endIndex - startIndex)

  const targets: number[] = []
  let previous = -1
  for (let i = 0; i < safeChunkCount; i += 1) {
    const ratio = safeChunkCount === 1 ? 0.5 : i / (safeChunkCount - 1)
    let weekIndex = Math.round(startIndex + span * ratio)
    if (weekIndex <= previous && previous < endIndex) {
      weekIndex = previous + 1
    }
    if (weekIndex > endIndex) {
      weekIndex = endIndex
    }
    previous = weekIndex
    targets.push(weekIndex)
  }

  return targets
}

const buildWeekPreferenceOrder = (weekCount: number, targetWeekIndex: number) => {
  const visited = new Set<number>()
  const ordered: number[] = []
  const safeWeekCount = Math.max(1, weekCount)
  const safeTarget = Math.max(0, Math.min(safeWeekCount - 1, targetWeekIndex))

  for (let distance = 0; distance < safeWeekCount; distance += 1) {
    const left = safeTarget - distance
    const right = safeTarget + distance

    if (left >= 0 && !visited.has(left)) {
      visited.add(left)
      ordered.push(left)
    }

    if (right < safeWeekCount && !visited.has(right)) {
      visited.add(right)
      ordered.push(right)
    }
  }

  return ordered
}

const getAssignmentMomentOrder = (dateValue: Date, sessionLabel: string) => {
  const normalizedDate = new Date(dateValue)
  normalizedDate.setHours(0, 0, 0, 0)

  const slotPeriods = resolveSlotPeriods(sessionLabel)
  const firstPeriod = slotPeriods.length > 0 ? Math.min(...slotPeriods) : 0

  return normalizedDate.getTime() + firstPeriod
}

const getWeekOfYear = (dateValue: Date) => {
  const date = new Date(Date.UTC(dateValue.getFullYear(), dateValue.getMonth(), dateValue.getDate()))
  const dayNum = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  return Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
}

const normalizeSession = (raw: string) => {
  const value = String(raw || "").trim().toLowerCase()
  if (value.includes("sáng") || value.includes("sang") || value.includes("morning")) return "Sáng"
  if (value.includes("chiều") || value.includes("chieu") || value.includes("afternoon")) return "Chiều"
  if (value.includes("tối") || value.includes("toi") || value.includes("evening")) return "Tối"
  return ""
}

const normalizeWeekdayPreference = (raw: string) => {
  const value = String(raw || "").trim().toLowerCase()
  const map: Record<string, number> = {
    "2": 1,
    "thứ 2": 1,
    "thu 2": 1,
    "3": 2,
    "thứ 3": 2,
    "thu 3": 2,
    "4": 3,
    "thứ 4": 3,
    "thu 4": 3,
    "5": 4,
    "thứ 5": 4,
    "thu 5": 4,
    "6": 5,
    "thứ 6": 5,
    "thu 6": 5,
    "7": 6,
    "thứ 7": 6,
    "thu 7": 6,
    "cn": 0,
    "chủ nhật": 0,
    "chu nhat": 0,
    "sunday": 0,
  }

  if (map[value] !== undefined) return map[value]

  const firstNumber = Number((value.match(/\d+/) || [""])[0])
  if (firstNumber >= 2 && firstNumber <= 7) {
    return firstNumber - 1
  }
  return null
}

const preferenceScore = (
  settings: GenerationPayload["settings"],
  prefIndex: Map<string, number>,
  maGV: number,
  weekday: number,
  buoi: string,
) => {
  if (!settings.respectPreferences) return 0

  const key = `${maGV}_${weekday}_${buoi}`
  const priority = prefIndex.get(key)
  if (!priority) return -1

  if (priority === 1) return 16
  if (priority === 2) return 10
  if (priority === 3) return 5
  return 0
}

const weightedRandom = <T,>(items: Array<{ value: T; score: number }>) => {
  if (items.length === 0) return null

  const sorted = [...items].sort((a, b) => b.score - a.score)
  const topBucket = sorted.slice(0, Math.min(6, sorted.length))

  const minScore = Math.min(...topBucket.map((item) => item.score))
  const shifted = topBucket.map((item) => ({
    ...item,
    weight: item.score - minScore + 1,
  }))

  const totalWeight = shifted.reduce((sum, item) => sum + item.weight, 0)
  let threshold = Math.random() * totalWeight
  for (const item of shifted) {
    threshold -= item.weight
    if (threshold <= 0) return item.value
  }

  return shifted[0].value
}

const runGeneration = async (job: JobState, payload: GenerationPayload) => {
  let pool: any
  try {
    updateStep(job, 0, "running", "Đang tải dữ liệu nguồn...", 8)

    pool = await new sql.ConnectionPool(dbConfig).connect()

    const allMajorsMode = payload.majorId === "all"

    const majorResult = allMajorsMode
      ? await pool.request().query(`
          SELECT MaNganh, TenNganh, MaKhoa
          FROM NGANH
        `)
      : await pool.request().input("majorId", payload.majorId).query(`
          SELECT TOP 1 MaNganh, TenNganh, MaKhoa
          FROM NGANH
          WHERE CAST(MaNganh AS NVARCHAR(50)) = @majorId
        `)

    if (!majorResult.recordset.length) {
      throw new Error("Không tìm thấy ngành đã chọn")
    }

    const majorNames = (majorResult.recordset || []).map((item: any) => String(item.TenNganh || "").trim()).filter(Boolean)
    const majorName = majorNames[0] || ""
    const majorDepartmentId = String(majorResult.recordset?.[0]?.MaKhoa || "").trim()

    const classColumns = await getTableColumns(pool, "LOP")
    const hasClassSizeColumn = classColumns.has("siso")
    const roomColumns = await getTableColumns(pool, "PHONG")
    const hasRoomCapacityColumn = roomColumns.has("succhua")

    const classResult = allMajorsMode
      ? await pool.request().query(`
          SELECT MaLop, TenLop, Nam, MaNganh, ${hasClassSizeColumn ? "TRY_CONVERT(INT, SiSo)" : "CAST(NULL AS INT)"} AS SiSo
          FROM LOP
          WHERE UPPER(LTRIM(RTRIM(ISNULL(TrangThai, '')))) NOT IN (N'ĐÃ TỐT NGHIỆP', N'DA TOT NGHIEP')
          ORDER BY MaLop ASC
        `)
      : await pool.request().input("majorId", payload.majorId).query(`
          SELECT MaLop, TenLop, Nam, MaNganh, ${hasClassSizeColumn ? "TRY_CONVERT(INT, SiSo)" : "CAST(NULL AS INT)"} AS SiSo
          FROM LOP
          WHERE CAST(MaNganh AS NVARCHAR(50)) = @majorId
            AND UPPER(LTRIM(RTRIM(ISNULL(TrangThai, '')))) NOT IN (N'ĐÃ TỐT NGHIỆP', N'DA TOT NGHIEP')
          ORDER BY MaLop ASC
        `)

    const classes: ClassRow[] = classResult.recordset || []
    if (!classes.length) {
      throw new Error("Ngành đã chọn chưa có lớp đang hoạt động để lập lịch")
    }

    const classYears = Array.from(
      new Set(
        classes
          .map((item) => Number(item.Nam))
          .filter((item) => Number.isFinite(item) && item > 0)
      )
    )

    const semesterColumns = await getTableColumns(pool, "HOC_KY")
    const hasTenNganhHK = semesterColumns.has("tennganhhk")
    const hasMaNganhHK = semesterColumns.has("manganhhk")

    const semesterRequest = pool.request()
    const semesterWhereClauses: string[] = []

    if (!allMajorsMode) {
      if (hasMaNganhHK) {
        semesterRequest.input("majorId", payload.majorId)
        semesterWhereClauses.push(`CAST(hk.MaNganhHK AS NVARCHAR(50)) = @majorId`)
      } else if (hasTenNganhHK) {
        semesterRequest.input("majorName", majorName)
        semesterWhereClauses.push(`LTRIM(RTRIM(ISNULL(hk.TenNganhHK, ''))) = @majorName`)
      }
    }

    if (payload.semesterIds.length > 0) {
      payload.semesterIds.forEach((id, index) => {
        semesterRequest.input(`semesterId${index}`, String(id))
      })
      semesterWhereClauses.push(
        `CAST(hk.MaHK AS NVARCHAR(50)) IN (${payload.semesterIds.map((_, i) => `@semesterId${i}`).join(",")})`
      )
    } else {
      if (classYears.length > 0) {
        classYears.forEach((year, index) => {
          semesterRequest.input(`classYear${index}`, sql.Int, year)
        })
        semesterWhereClauses.push(
          `TRY_CONVERT(INT, hk.NamHK) IN (${classYears.map((_, i) => `@classYear${i}`).join(",")})`
        )
      }
    }

    if (semesterWhereClauses.length === 0) {
      throw new Error("Không đủ dữ liệu học kỳ để lập lịch. Vui lòng cấu hình học kỳ cho ngành trước")
    }

    const semesterResult = await semesterRequest.query(`
      SELECT hk.MaHK, hk.TenHK, hk.NamHK, hk.TuNgay, hk.DenNgay,
             ${hasMaNganhHK ? "CAST(hk.MaNganhHK AS NVARCHAR(50))" : "CAST(NULL AS NVARCHAR(50))"} AS MaNganhHK,
             ${hasTenNganhHK ? "CAST(hk.TenNganhHK AS NVARCHAR(255))" : "CAST(NULL AS NVARCHAR(255))"} AS TenNganhHK
      FROM HOC_KY hk
      WHERE (${semesterWhereClauses.join(" AND ")})
        AND ${ONGOING_STATUS_SQL}
      ORDER BY hk.TuNgay ASC, hk.MaHK ASC
    `)

    const semesters: SemesterRow[] = semesterResult.recordset || []

    if (!semesters.length) {
      throw new Error("Không tìm thấy học kỳ ở trạng thái Đang diễn ra phù hợp để lập lịch")
    }

    const semesterYears = Array.from(
      new Set(
        semesters
          .map((row) => parseClassYear(row.NamHK))
          .filter((value): value is number => value !== null)
      )
    )
    const semesterCountByYear = new Map<number, number>()
    if (semesterYears.length > 0) {
      const semesterCountRequest = pool.request()
      semesterYears.forEach((year, index) => {
        semesterCountRequest.input(`semesterYear${index}`, sql.Int, year)
      })

      const semesterCountResult = await semesterCountRequest.query(`
        SELECT TRY_CONVERT(INT, hk.NamHK) AS NamHK, COUNT(DISTINCT TRY_CONVERT(INT, hk.TenHK)) AS SemesterCount
        FROM HOC_KY hk
        WHERE TRY_CONVERT(INT, hk.NamHK) IN (${semesterYears.map((_, index) => `@semesterYear${index}`).join(",")})
        GROUP BY TRY_CONVERT(INT, hk.NamHK)
      `)

      for (const row of semesterCountResult.recordset || []) {
        const year = Number(row.NamHK)
        const count = Number(row.SemesterCount)
        if (Number.isFinite(year) && Number.isFinite(count) && year > 0 && count > 0) {
          semesterCountByYear.set(year, count)
        }
      }
    }

    const semesterWindowById = new Map<number, { start: Date; end: Date }>()
    for (const semester of semesters) {
      semesterWindowById.set(semester.MaHK, buildEffectiveSemesterWindow(semester, semesterCountByYear))
    }

    const semesterIds = semesters.map((row) => row.MaHK)

    const linkTableResult = await pool.request().query(`
      SELECT TABLE_NAME
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_NAME IN ('HOC_KY_CAC_MON_HOC', 'HOC_KY_CAC_MON')
    `)

    const linkNames = (linkTableResult.recordset || []).map((row: any) => String(row.TABLE_NAME || "").trim())
    const linkTable = linkNames.includes("HOC_KY_CAC_MON_HOC")
      ? "HOC_KY_CAC_MON_HOC"
      : linkNames.includes("HOC_KY_CAC_MON")
        ? "HOC_KY_CAC_MON"
        : ""

    if (!linkTable) {
      throw new Error("Không tìm thấy bảng liên kết học kỳ - môn học")
    }

    const courseResult = allMajorsMode
      ? await pool.request().query(`
          SELECT hkm.MaHK, m.MaMon, m.TenMon, m.SoTiet, m.LoaiMon
          FROM ${linkTable} hkm
          INNER JOIN MON m ON m.MaMon = hkm.MaMon
          WHERE hkm.MaHK IN (${semesterIds.join(",")})
          ORDER BY hkm.MaHK, m.MaMon
        `)
      : await pool.request().input("majorId", payload.majorId).query(`
          SELECT hkm.MaHK, m.MaMon, m.TenMon, m.SoTiet, m.LoaiMon
          FROM ${linkTable} hkm
          INNER JOIN MON m ON m.MaMon = hkm.MaMon
          WHERE hkm.MaHK IN (${semesterIds.join(",")})
            AND CAST(m.MaNganh AS NVARCHAR(50)) = @majorId
          ORDER BY hkm.MaHK, m.MaMon
        `)

    const instructorResult = allMajorsMode
      ? await pool.request().query(`
          SELECT gv.MaGV, gv.TenGV
          FROM GIANG_VIEN gv
          WHERE UPPER(
            REPLACE(
              REPLACE(LTRIM(RTRIM(ISNULL(gv.TrangThai, ''))), N'Đ', N'D'),
              N'đ',
              N'd'
            ) COLLATE Latin1_General_100_CI_AI
          ) IN (N'CO THE DAY', N'ACTIVE', N'HOAT DONG', N'DANG DAY', N'')
            AND UPPER(
              REPLACE(
                REPLACE(LTRIM(RTRIM(ISNULL(gv.TrangThai, ''))), N'Đ', N'D'),
                N'đ',
                N'd'
              ) COLLATE Latin1_General_100_CI_AI
            ) NOT IN (N'TAM DUNG', N'TAM NGUNG', N'VO HIEU HOA', N'INACTIVE')
          ORDER BY gv.MaGV ASC
        `)
      : await pool.request().input("majorDepartmentId", majorDepartmentId).query(`
          SELECT gv.MaGV, gv.TenGV
          FROM GIANG_VIEN gv
          WHERE UPPER(
            REPLACE(
              REPLACE(LTRIM(RTRIM(ISNULL(gv.TrangThai, ''))), N'Đ', N'D'),
              N'đ',
              N'd'
            ) COLLATE Latin1_General_100_CI_AI
          ) IN (N'CO THE DAY', N'ACTIVE', N'HOAT DONG', N'DANG DAY', N'')
            AND UPPER(
              REPLACE(
                REPLACE(LTRIM(RTRIM(ISNULL(gv.TrangThai, ''))), N'Đ', N'D'),
                N'đ',
                N'd'
              ) COLLATE Latin1_General_100_CI_AI
            ) NOT IN (N'TAM DUNG', N'TAM NGUNG', N'VO HIEU HOA', N'INACTIVE')
            AND (@majorDepartmentId = '' OR CAST(gv.MaKhoa AS NVARCHAR(50)) = @majorDepartmentId)
          ORDER BY gv.MaGV ASC
        `)

    const expertiseResult = allMajorsMode
      ? await pool.request().query(`
          SELECT cm.MaGV, cm.MaMon
          FROM CHUYEN_MON_CUA_GV cm
          INNER JOIN MON m ON m.MaMon = cm.MaMon
        `)
      : await pool.request().input("majorId", payload.majorId).query(`
          SELECT cm.MaGV, cm.MaMon
          FROM CHUYEN_MON_CUA_GV cm
          INNER JOIN MON m ON m.MaMon = cm.MaMon
          WHERE CAST(m.MaNganh AS NVARCHAR(50)) = @majorId
        `)

    const roomResult = await pool.request().query(`
      SELECT MaPhong, TenPhong, LoaiPhong, ${hasRoomCapacityColumn ? "TRY_CONVERT(INT, SucChua)" : "CAST(NULL AS INT)"} AS SucChua
      FROM PHONG
      WHERE UPPER(LTRIM(RTRIM(ISNULL(TrangThai, '')))) NOT IN (N'BẢO TRÌ', N'BAO TRI', N'KHÓA', N'KHOA', N'INACTIVE')
      ORDER BY MaPhong ASC
    `)

    const prefResult = await pool.request().query(`
      SELECT MaGV, ThuTrongTuan, TietDay, MucDoUuTien
      FROM NGUYEN_VONG_THOI_GIAN
      WHERE MucDoUuTien IN (1,2,3)
    `)

    const sourceCourseRows = courseResult.recordset || []
    const excludedThesisCount = sourceCourseRows.filter((row: any) => isThesisCourse(row.TenMon)).length
    const excludedProjectCount = sourceCourseRows.filter((row: any) => isProjectCourse(row.TenMon) && !isThesisCourse(row.TenMon)).length
    const excludedInternshipCount = sourceCourseRows.filter((row: any) => isFinalInternshipCourse(row.TenMon)).length

    let courses: CourseRow[] = sourceCourseRows.filter((row: any) => !isExcludedFromScheduleCourse(row.TenMon))
    const instructors: InstructorRow[] = instructorResult.recordset || []
    const rooms: RoomRow[] = roomResult.recordset || []
    const preferences: TimePreference[] = (prefResult.recordset || []).map((row: any) => ({
      maGV: Number(row.MaGV),
      thuTrongTuan: String(row.ThuTrongTuan || ""),
      tietDay: String(row.TietDay || ""),
      mucDoUuTien: Number(row.MucDoUuTien || 0),
    }))

    if (courses.length === 0) {
      const fallbackMonResult = allMajorsMode
        ? await pool
            .request()
            .query(`
              SELECT MaMon, TenMon, SoTiet, LoaiMon, TRY_CONVERT(INT, HocKy) AS HocKyNum
              FROM MON
            `)
        : await pool
            .request()
            .input("majorId", payload.majorId)
            .query(`
              SELECT MaMon, TenMon, SoTiet, LoaiMon, TRY_CONVERT(INT, HocKy) AS HocKyNum
              FROM MON
              WHERE CAST(MaNganh AS NVARCHAR(50)) = @majorId
            `)

      const semesterByNumber = new Map<number, SemesterRow>()
      for (const semester of semesters) {
        const semesterNum = Number((String(semester.TenHK || "").match(/\d+/) || [0])[0])
        if (Number.isFinite(semesterNum) && semesterNum > 0 && !semesterByNumber.has(semesterNum)) {
          semesterByNumber.set(semesterNum, semester)
        }
      }

      const fallbackRows = fallbackMonResult.recordset || []
      for (const row of fallbackRows) {
        if (isExcludedFromScheduleCourse(row.TenMon)) continue

        const hocKyNum = Number(row.HocKyNum)
        const mappedSemester = semesterByNumber.get(hocKyNum) || semesters[0]
        if (!mappedSemester) continue

        courses.push({
          MaHK: Number(mappedSemester.MaHK),
          MaMon: Number(row.MaMon),
          TenMon: String(row.TenMon || "").trim(),
          SoTiet: Number(row.SoTiet || 0),
          LoaiMon: String(row.LoaiMon || "").trim(),
        })
      }
    }

    if (!courses.length) throw new Error("Không có môn học trong học kỳ đã chọn")
    if (!instructors.length) throw new Error("Không có giảng viên ở trạng thái có thể dạy")
    if (!rooms.length) throw new Error("Không có phòng học khả dụng")

    const classById = new Map<number, ClassRow>(classes.map((item) => [Number(item.MaLop), item]))
    const roomById = new Map<number, RoomRow>(rooms.map((item) => [Number(item.MaPhong), item]))

    const expertiseByCourse = new Map<number, number[]>()
    for (const row of expertiseResult.recordset || []) {
      const maMon = Number(row.MaMon)
      const maGV = Number(row.MaGV)
      if (!Number.isFinite(maMon) || !Number.isFinite(maGV)) continue
      if (!expertiseByCourse.has(maMon)) expertiseByCourse.set(maMon, [])
      expertiseByCourse.get(maMon)!.push(maGV)
    }

    const prefIndex = new Map<string, number>()
    for (const pref of preferences) {
      const weekday = normalizeWeekdayPreference(pref.thuTrongTuan)
      const session = normalizeSession(pref.tietDay)
      if (weekday === null || !session) continue
      prefIndex.set(`${pref.maGV}_${weekday}_${session}`, Number(pref.mucDoUuTien || 0))
    }

    updateStep(
      job,
      0,
      "completed",
      `Đã tải ${semesters.length} học kỳ, ${classes.length} lớp, ${courses.length} môn, ${instructors.length} giảng viên, ${rooms.length} phòng`,
      24,
    )

    updateStep(job, 1, "running", "Đang tạo danh sách tác vụ giảng dạy...", 30)

    const coursesBySemester = new Map<number, CourseRow[]>()
    for (const course of courses) {
      const list = coursesBySemester.get(course.MaHK) || []
      list.push(course)
      coursesBySemester.set(course.MaHK, list)
    }

    const tasks: Task[] = []
    const warnings: string[] = []

    for (const semester of semesters) {
      const semesterNumber = String(semester.TenHK || "").trim()
      const semesterClassYear = parseClassYear(semester.NamHK)
      const semesterMajorId = String(semester.MaNganhHK || "").trim()
      const semesterMajorName = String(semester.TenNganhHK || "").trim().toLowerCase()

      const matchedClasses = classes.filter((item) => {
        const classYearOk = semesterClassYear ? toNumber(item.Nam, -1) === semesterClassYear : true
        if (!classYearOk) return false

        if (!allMajorsMode) return true

        const classMajorId = String(item.MaNganh || "").trim()
        if (semesterMajorId && classMajorId) {
          return classMajorId === semesterMajorId
        }

        if (semesterMajorName) {
          const classMajorName = String(
            majorResult.recordset.find((m: any) => String(m.MaNganh || "").trim() === classMajorId)?.TenNganh || ""
          ).trim().toLowerCase()
          return classMajorName === semesterMajorName
        }

        return true
      })

      const semesterCourses = coursesBySemester.get(semester.MaHK) || []

      if (!matchedClasses.length) {
        warnings.push(`Học kỳ ${semesterNumber}: không có lớp tương ứng năm học ${String(semester.NamHK || "?")}`)
      }

      for (const classRow of matchedClasses) {
        for (const course of semesterCourses) {
          const totalPeriods = Math.max(2, toNumber(course.SoTiet, 0) || 30)
          const chunkPlan = buildChunkPlan(totalPeriods)
          const semesterWindow = semesterWindowById.get(semester.MaHK) || buildEffectiveSemesterWindow(semester, semesterCountByYear)
          const weekStarts = buildWeekStarts(semesterWindow.start, semesterWindow.end)
          const isPractice = isPracticeCourseType(course.LoaiMon, course.TenMon)
          const targetWeeks = buildTargetWeekIndexes(weekStarts.length, chunkPlan.length, isPractice, payload.settings.balanceWorkload)
          const plannedSpanWeeks =
            targetWeeks.length > 0
              ? Math.max(1, targetWeeks[targetWeeks.length - 1] - targetWeeks[0] + 1)
              : Math.max(1, weekStarts.length)
          const maxMeetingsPerWeek = payload.settings.balanceWorkload
            ? Math.max(1, Math.ceil(chunkPlan.length / plannedSpanWeeks))
            : Math.max(2, Math.ceil(chunkPlan.length / Math.max(1, Math.min(plannedSpanWeeks, 2))))
          const preferredRoomType = resolvePreferredRoomType(course.LoaiMon, course.TenMon)
          const courseRunKey = `${classRow.MaLop}_${course.MaMon}`

          chunkPlan.forEach((chunk, chunkOffset) => {
            const chunkIndex = chunkOffset + 1
            tasks.push({
              taskId: `${semester.MaHK}_${classRow.MaLop}_${course.MaMon}_${chunkIndex}`,
              maLop: classRow.MaLop,
              maMon: course.MaMon,
              maHK: semester.MaHK,
              hocKyDay: semesterNumber,
              soTietDay: chunk,
              chunkIndex,
              courseName: String(course.TenMon || "").trim(),
              isInternship: isFinalInternshipCourse(course.TenMon),
              isPractice,
              baseCourseKey: getBaseCourseKey(course.TenMon),
              courseRunKey,
              preferredRoomType,
              targetWeekIndex: targetWeeks[chunkOffset] ?? 0,
              maxMeetingsPerWeek,
            })
          })
        }
      }
    }

    if (!tasks.length) {
      throw new Error("Không tạo được tác vụ nào để lập lịch")
    }

    if (excludedThesisCount > 0) {
      warnings.push(`Đã bỏ qua ${excludedThesisCount} môn khóa luận tốt nghiệp khỏi tác vụ lập lịch`)
    }
    if (excludedProjectCount > 0) {
      warnings.push(`Đã bỏ qua ${excludedProjectCount} môn đồ án khỏi tác vụ lập lịch`)
    }
    if (excludedInternshipCount > 0) {
      warnings.push(`Đã bỏ qua ${excludedInternshipCount} môn thực tập cuối khóa/thực tập tốt nghiệp khỏi tác vụ lập lịch`)
    }

    updateStep(job, 1, "completed", `Đã tạo ${tasks.length} tác vụ phân lịch`, 44)

    updateStep(job, 2, "running", "Đang sinh lịch theo ràng buộc...", 50)

    const tasksSorted = [...tasks].sort((a, b) => {
      const aExpert = (expertiseByCourse.get(a.maMon) || []).length
      const bExpert = (expertiseByCourse.get(b.maMon) || []).length
      if (aExpert !== bExpert) return aExpert - bExpert
      if (a.maLop !== b.maLop) return a.maLop - b.maLop
      // Group by baseCourseKey so theory and practice of same course are adjacent
      if (a.baseCourseKey !== b.baseCourseKey) return a.baseCourseKey.localeCompare(b.baseCourseKey)
      // Within same pair: theory (ly thuyet) ALWAYS before practice (thuc hanh)
      if (a.isPractice !== b.isPractice) return a.isPractice ? 1 : -1
      return a.chunkIndex - b.chunkIndex
    })

    // Build a set of pairKeys that have BOTH a theory AND a practice task.
    // Used to enforce theory-before-practice only for genuine pairs.
    const pairKeysWithBothTheoryAndPractice = new Set<string>()
    {
      const theorySeen = new Set<string>()
      const practiceSeen = new Set<string>()
      for (const t of tasksSorted) {
        const pk = getTheoryPracticePairKey(t)
        if (t.isPractice) practiceSeen.add(pk)
        else theorySeen.add(pk)
      }
      for (const pk of practiceSeen) {
        if (theorySeen.has(pk)) pairKeysWithBothTheoryAndPractice.add(pk)
      }
    }

    const theoryPeriodCountByPair = new Map<string, number>()
    for (const task of tasksSorted) {
      const pairKey = getTheoryPracticePairKey(task)
      if (!pairKeysWithBothTheoryAndPractice.has(pairKey)) continue
      if (!task.isPractice) {
        theoryPeriodCountByPair.set(pairKey, (theoryPeriodCountByPair.get(pairKey) || 0) + task.soTietDay)
      }
    }

    const taskCount = tasksSorted.length
    const isLargeWorkload = taskCount >= 600
    // Moderate candidate pool with smart capping
    const maxCandidatesPerTask = isLargeWorkload ? 300 : taskCount >= 350 ? 400 : 500
    // chromosomeGeneSpan: how many top-ranked candidates a chromosome gene can index into
    const chromosomeGeneSpan = isLargeWorkload ? 60 : 150
    // searchLimitPerTask: how many candidates to scan per task during decode
    const searchLimitPerTask = isLargeWorkload ? 120 : 250

    const semesterById = new Map<number, SemesterRow>(semesters.map((item) => [item.MaHK, item]))
    const warnedMissingExpertise = new Set<number>()

    const candidateByTask: Candidate[][] = tasksSorted.map((task, taskIndex) => {
      const semester = semesterById.get(task.maHK)
      if (!semester) return []

      const semesterWindow = semesterWindowById.get(semester.MaHK) || buildEffectiveSemesterWindow(semester, semesterCountByYear)
      const weekStarts = buildWeekStarts(semesterWindow.start, semesterWindow.end)
      const weekOrder = buildWeekPreferenceOrder(weekStarts.length, task.targetWeekIndex)

      const eligibleTeachers = (expertiseByCourse.get(task.maMon) || [])
        .filter((maGV) => instructors.some((gv) => gv.MaGV === maGV))
      const teacherPool = eligibleTeachers

      if (eligibleTeachers.length === 0 && !warnedMissingExpertise.has(task.maMon)) {
        warnings.push(`Môn ${task.maMon} không có giảng viên đúng chuyên môn trong trạng thái có thể dạy`)
        warnedMissingExpertise.add(task.maMon)
      }

      const localCandidates: Candidate[] = []
      const dayOrder = [1, 2, 3, 4, 5, 6, 7]
      const hasScarceTeacherSupply = eligibleTeachers.length <= 1
      const needsWideCandidateSearch = task.isPractice || hasScarceTeacherSupply
      const roomPoolLimit = needsWideCandidateSearch
        ? (task.isPractice ? 36 : 24)
        : (isLargeWorkload ? 6 : (payload.settings.optimizeRooms ? 10 : 14))
      const taskMaxCandidates = needsWideCandidateSearch
        ? (isLargeWorkload ? 1400 : 2600)
        : maxCandidatesPerTask
      // Limit rooms per task to prevent heap overflow while keeping all weeks
      // Practice tasks ALWAYS require practice rooms (hard constraint)
      const matchingRooms = (payload.settings.optimizeRooms || task.isPractice)
        ? rooms.filter((room) => roomMatchesPreferredType(room.LoaiPhong, task.preferredRoomType))
        : rooms
      const roomPool = rotatePool(
        matchingRooms.length > 0 ? matchingRooms : rooms,
        Math.min(roomPoolLimit, Math.max(1, (matchingRooms.length > 0 ? matchingRooms : rooms).length)),
        task.maLop + task.maMon + task.chunkIndex,
      )
      const maxCandidates = taskMaxCandidates

      candidateLoop:
      for (const weekIndex of weekOrder) {
        for (const day of dayOrder) {
          for (const slot of SLOT_OPTIONS) {
            const slotPeriods = resolveSlotPeriods(slot.label)
            if (slotPeriods.length < task.soTietDay) continue

            const date = new Date(weekStarts[weekIndex])
            date.setDate(date.getDate() + (day - 1))
            date.setHours(12, 0, 0, 0)

            for (const maGV of teacherPool) {
              for (const room of roomPool) {
                const prefBonus = preferenceScore(payload.settings, prefIndex, maGV, day, slot.preferenceSession)
                const weekDistance = Math.abs(weekIndex - task.targetWeekIndex)
                const roomTypeBonus = payload.settings.optimizeRooms
                  ? (roomMatchesPreferredType(room.LoaiPhong, task.preferredRoomType) ? 4 : -10)
                  : 0
                // Even week spread: penalize packing too many in first/last weeks
                const normalizedWeek = weekStarts.length > 1 ? weekIndex / (weekStarts.length - 1) : 0.5
                const spreadBonus = -Math.abs(normalizedWeek - (task.targetWeekIndex / Math.max(1, weekStarts.length - 1))) * 3
                const staticScore = prefBonus + roomTypeBonus + spreadBonus - weekDistance * 3.5 + Math.random() * 0.3

                const assignment: Assignment = {
                  maLop: task.maLop,
                  maMon: task.maMon,
                  maGV,
                  maPhong: room.MaPhong,
                  ngayDay: date,
                  soTietDay: task.soTietDay,
                  hocKyDay: task.hocKyDay,
                  buoi: slot.label,
                  tuan: `Tuần ${getWeekOfYear(date)}`,
                }

                localCandidates.push({
                  assignment,
                  weekIndex,
                  staticScore,
                  weekDistance,
                  teacherKeys: slotPeriods.map((period) => `${maGV}_${weekIndex}_${day}_${period}`),
                  classKeys: slotPeriods.map((period) => `${task.maLop}_${weekIndex}_${day}_${period}`),
                  roomKeys: slotPeriods.map((period) => `${room.MaPhong}_${weekIndex}_${day}_${period}`),
                })

                if (localCandidates.length >= maxCandidates) {
                  break candidateLoop
                }
              }
            }
          }
        }
      }

      if (taskIndex % 25 === 0) {
        const dynamicProgress = 50 + Math.round((taskIndex / Math.max(1, tasksSorted.length)) * 10)
        job.progress = Math.max(job.progress, dynamicProgress)
      }

      return localCandidates.sort((a, b) => b.staticScore - a.staticScore)
    })

    const randomChromosome = () => candidateByTask.map((candidates) => {
      if (!candidates.length) return -1
      return Math.floor(Math.random() * Math.min(candidates.length, chromosomeGeneSpan))
    })

    // Strict mode: never allow teacher/class/room overlap in final schedule.
    const enforceConflictRules = true
    const enforceRoomOptimization = payload.settings.optimizeRooms
    const enforceBalancedWorkload = payload.settings.balanceWorkload
    const allowPracticeAcceleration = true
    const maxClassPeriodsPerWeek = enforceBalancedWorkload ? 18 : 28
    const maxTeacherPeriodsPerWeek = enforceBalancedWorkload ? 18 : 28
    const maxDistinctSubjectsPerClassWeek = enforceBalancedWorkload ? 4 : 8

    const getCourseWeeklyCap = (task: Task, classWeekPeriods = 0) => {
      const baseCap = Math.max(1, Number(task.maxMeetingsPerWeek || 1))
      if (!task.isPractice || !allowPracticeAcceleration) return baseCap
      const emptyWeekBoost = classWeekPeriods <= 0 ? 3 : 2
      return Math.max(baseCap * emptyWeekBoost, baseCap + 1)
    }

    const shouldEnforceRecurringTemplateForTask = (task: Task) => {
      return !task.isPractice || !allowPracticeAcceleration
    }

    const getMinimumTheoryPeriodsBeforePractice = (requiredTheoryPeriods: number) => {
      if (!Number.isFinite(requiredTheoryPeriods) || requiredTheoryPeriods <= 0) return 0
      return Math.max(1, Math.ceil(requiredTheoryPeriods))
    }

    const decodeChromosome = (chromosome: number[]) => {
      const teacherBusy = new Set<string>()
      const classBusy = new Set<string>()
      const roomBusy = new Set<string>()
      const classSubjectDayBusy = new Set<string>()
      const classWeekLoad = new Map<string, number>()
      const teacherWeekLoad = new Map<string, number>()
      const courseWeekCount = new Map<string, number>()
      const classWeekSubjects = new Map<string, Set<number>>()
      const lastWeekByCourseRun = new Map<string, number>()
      const theoryWeekByKey = new Map<string, number>()
      const latestTheoryWeekByKey = new Map<string, number>()
      const latestTheoryMomentByKey = new Map<string, number>()
      const theoryAssignedPeriodsByPair = new Map<string, number>()
      const practiceWeekByKey = new Map<string, number>()
      const recurringTemplateByCourseRun = new Map<string, { weekday: number; session: string; maGV: number; maPhong: number }>()

      const selected: Array<{ task: Task; candidate: Candidate } | null> = []
      let unassigned = 0
      let score = 0

      for (let i = 0; i < chromosome.length; i += 1) {
        const task = tasksSorted[i]
        const candidates = candidateByTask[i]

        if (!candidates.length) {
          selected.push(null)
          unassigned += 1
          continue
        }

        const pairKey = getTheoryPracticePairKey(task)
        const preferStart = chromosome[i] >= 0 && chromosome[i] < candidates.length ? chromosome[i] : 0
        const searchLimit = Math.min(candidates.length, searchLimitPerTask)
        const recurringTemplate = recurringTemplateByCourseRun.get(task.courseRunKey)

        let bestCandidate: Candidate | null = null
        let bestCandidateScore = Number.NEGATIVE_INFINITY

        for (let offset = 0; offset < searchLimit; offset += 1) {
          const index = (preferStart + offset) % candidates.length
          const candidate = candidates[index]

          const hasTeacherConflict = candidate.teacherKeys.some((key) => teacherBusy.has(key))
          const hasClassConflict = candidate.classKeys.some((key) => classBusy.has(key))
          const hasRoomConflict = candidate.roomKeys.some((key) => roomBusy.has(key))
          const conflictCount = Number(hasTeacherConflict) + Number(hasClassConflict) + Number(hasRoomConflict)
          if (enforceConflictRules && (hasTeacherConflict || hasClassConflict || hasRoomConflict)) {
            continue
          }

          const candidateDateKey = candidate.assignment.ngayDay.toISOString().slice(0, 10)
          const classSubjectDayKey = `${task.maLop}_${task.maMon}_${candidateDateKey}`
          const sameSubjectSameDay = classSubjectDayBusy.has(classSubjectDayKey)

          const classInfo = classById.get(Number(task.maLop))
          const classSize = Number(classInfo?.SiSo || 0)
          const roomInfo = roomById.get(Number(candidate.assignment.maPhong))
          const roomCapacity = Number(roomInfo?.SucChua || 0)
          if (enforceRoomOptimization && classSize > 0 && roomCapacity > 0 && roomCapacity < classSize) continue
          // Hard constraint: practice tasks must use practice rooms
          if (task.isPractice && !roomMatchesPreferredType(roomInfo?.LoaiPhong, task.preferredRoomType)) continue

          const currentLoad = classWeekLoad.get(`${task.maLop}_${candidate.weekIndex}`) || 0
          if (currentLoad + task.soTietDay > maxClassPeriodsPerWeek) continue

          const teacherWeekKey = `${candidate.assignment.maGV}_${candidate.weekIndex}`
          const currentTeacherWeekLoad = teacherWeekLoad.get(teacherWeekKey) || 0
          // Soft target thay hard limit: chi hard-block neu vuot rat nhieu (110% target)
          const teacherLoadHardLimit = Math.ceil(maxTeacherPeriodsPerWeek * 1.1)
          if (currentTeacherWeekLoad + task.soTietDay > teacherLoadHardLimit) continue

          const courseWeekKey = `${task.courseRunKey}_${candidate.weekIndex}`
          const currentCourseWeekCount = courseWeekCount.get(courseWeekKey) || 0
          const courseWeeklyCap = getCourseWeeklyCap(task, currentLoad)
          if (enforceBalancedWorkload && currentCourseWeekCount >= courseWeeklyCap) continue

          const classWeekSubjectKey = `${task.maLop}_${candidate.weekIndex}`
          const subjectsInWeek = classWeekSubjects.get(classWeekSubjectKey) || new Set<number>()
          const isNewSubjectInWeek = !subjectsInWeek.has(task.maMon)
          if (isNewSubjectInWeek && subjectsInWeek.size >= maxDistinctSubjectsPerClassWeek) continue

          const lastCourseWeek = lastWeekByCourseRun.get(task.courseRunKey)
          const candidateWeekday = candidate.assignment.ngayDay.getDay()

          if (recurringTemplate && shouldEnforceRecurringTemplateForTask(task)) {
            if (
              recurringTemplate.weekday !== candidateWeekday ||
              recurringTemplate.session !== candidate.assignment.buoi ||
              recurringTemplate.maGV !== candidate.assignment.maGV ||
              recurringTemplate.maPhong !== candidate.assignment.maPhong
            ) {
              continue
            }
          }

          if (lastCourseWeek !== undefined && candidate.weekIndex < lastCourseWeek) continue

          let candidateScore = candidate.staticScore - currentLoad * 1.15 - currentTeacherWeekLoad * 1.1
          candidateScore -= candidate.weekDistance * 2.6
          if (!enforceConflictRules) {
            candidateScore -= conflictCount * 9
          }
          if (sameSubjectSameDay) {
            candidateScore -= enforceBalancedWorkload ? 4.5 : 2.5
          }
          if (isNewSubjectInWeek) {
            candidateScore -= subjectsInWeek.size * (enforceBalancedWorkload ? 2.2 : 0.8)
          }

          // Soft ordering: prefer later weeks for subsequent chunks but don't hard-block
          if (enforceBalancedWorkload && lastCourseWeek !== undefined) {
            const gapFromPrevious = candidate.weekIndex - lastCourseWeek
            if (gapFromPrevious < 0) {
              candidateScore -= 12 // Soft penalty for going backward
            } else if (gapFromPrevious === 0) {
              candidateScore -= 5 // Small penalty for same week
            } else if (gapFromPrevious === 1) {
              candidateScore += 4
            } else if (gapFromPrevious === 2) {
              candidateScore += 2
            } else {
              candidateScore -= (gapFromPrevious - 2) * 1.5
            }
          }

          // Ordering: practice is constrained only by the latest placed theory moment of the same pair.
          if (task.isPractice && pairKeysWithBothTheoryAndPractice.has(pairKey)) {
            const latestTheoryWeek = latestTheoryWeekByKey.get(pairKey)
            const latestTheoryMoment = latestTheoryMomentByKey.get(pairKey)
            const candidateMoment = getAssignmentMomentOrder(candidate.assignment.ngayDay, candidate.assignment.buoi)
            if (latestTheoryMoment !== undefined && candidateMoment <= latestTheoryMoment) continue
            candidateScore += Math.max(0, candidate.weekIndex - (latestTheoryWeek ?? candidate.weekIndex)) * 0.8
          } else if (!task.isPractice) {
            candidateScore -= candidate.weekIndex * 0.12
          }

          if (candidateScore > bestCandidateScore) {
            bestCandidate = candidate
            bestCandidateScore = candidateScore
          }
        }

        if (!bestCandidate) {
          selected.push(null)
          unassigned += 1
          continue
        }

        bestCandidate.teacherKeys.forEach((key) => teacherBusy.add(key))
        bestCandidate.classKeys.forEach((key) => classBusy.add(key))
        bestCandidate.roomKeys.forEach((key) => roomBusy.add(key))
        const selectedDateKey = bestCandidate.assignment.ngayDay.toISOString().slice(0, 10)
        classSubjectDayBusy.add(`${task.maLop}_${task.maMon}_${selectedDateKey}`)
        classWeekLoad.set(
          `${task.maLop}_${bestCandidate.weekIndex}`,
          (classWeekLoad.get(`${task.maLop}_${bestCandidate.weekIndex}`) || 0) + task.soTietDay,
        )
        teacherWeekLoad.set(
          `${bestCandidate.assignment.maGV}_${bestCandidate.weekIndex}`,
          (teacherWeekLoad.get(`${bestCandidate.assignment.maGV}_${bestCandidate.weekIndex}`) || 0) + task.soTietDay,
        )
        courseWeekCount.set(
          `${task.courseRunKey}_${bestCandidate.weekIndex}`,
          (courseWeekCount.get(`${task.courseRunKey}_${bestCandidate.weekIndex}`) || 0) + 1,
        )
        const classWeekSubjectKey = `${task.maLop}_${bestCandidate.weekIndex}`
        const subjectsInWeek = classWeekSubjects.get(classWeekSubjectKey) || new Set<number>()
        subjectsInWeek.add(task.maMon)
        classWeekSubjects.set(classWeekSubjectKey, subjectsInWeek)
        lastWeekByCourseRun.set(task.courseRunKey, bestCandidate.weekIndex)
        if (!recurringTemplateByCourseRun.has(task.courseRunKey) && shouldEnforceRecurringTemplateForTask(task)) {
          recurringTemplateByCourseRun.set(task.courseRunKey, {
            weekday: bestCandidate.assignment.ngayDay.getDay(),
            session: bestCandidate.assignment.buoi,
            maGV: bestCandidate.assignment.maGV,
            maPhong: bestCandidate.assignment.maPhong,
          })
        }

        if (task.isPractice) {
          const current = practiceWeekByKey.get(pairKey)
          practiceWeekByKey.set(pairKey, current === undefined ? bestCandidate.weekIndex : Math.min(current, bestCandidate.weekIndex))
        } else {
          const current = theoryWeekByKey.get(pairKey)
          theoryWeekByKey.set(pairKey, current === undefined ? bestCandidate.weekIndex : Math.min(current, bestCandidate.weekIndex))
          latestTheoryWeekByKey.set(
            pairKey,
            Math.max(latestTheoryWeekByKey.get(pairKey) ?? -1, bestCandidate.weekIndex),
          )
          latestTheoryMomentByKey.set(
            pairKey,
            Math.max(
              latestTheoryMomentByKey.get(pairKey) ?? -1,
              getAssignmentMomentOrder(bestCandidate.assignment.ngayDay, bestCandidate.assignment.buoi),
            ),
          )
          theoryAssignedPeriodsByPair.set(pairKey, (theoryAssignedPeriodsByPair.get(pairKey) || 0) + task.soTietDay)
        }

        score += bestCandidate.staticScore
        selected.push({ task, candidate: bestCandidate })
      }

      return {
        selected,
        unassigned,
        score,
        classWeekLoad,
        teacherWeekLoad,
        courseWeekCount,
        classWeekSubjects,
        lastWeekByCourseRun,
        theoryWeekByKey,
        latestTheoryWeekByKey,
        latestTheoryMomentByKey,
        theoryAssignedPeriodsByPair,
        practiceWeekByKey,
        recurringTemplateByCourseRun,
      }
    }

    const evaluateChromosome = (chromosome: number[]) => {
      const decoded = decodeChromosome(chromosome)
      let score = decoded.score
      let penalty = 0
      penalty += decoded.unassigned * 140

      const classToWeeks = new Map<number, number[]>()
      const courseRunWeeks = new Map<string, number[]>()
      for (const [key, load] of decoded.classWeekLoad.entries()) {
        const [maLopRaw, weekRaw] = key.split("_")
        const maLop = Number(maLopRaw)
        const week = Number(weekRaw)
        if (!Number.isFinite(maLop) || !Number.isFinite(week)) continue
        if (!classToWeeks.has(maLop)) classToWeeks.set(maLop, [])
        classToWeeks.get(maLop)!.push(week)

        if (enforceBalancedWorkload) {
          if (load > 14) penalty += (load - 14) * 8
          if (load < 3) penalty += (3 - load) * 2
        } else if (load > 20) {
          penalty += (load - 20) * 3
        }

        const distinctSubjects = decoded.classWeekSubjects.get(key)?.size || 0
        if (enforceBalancedWorkload && distinctSubjects > maxDistinctSubjectsPerClassWeek) {
          penalty += (distinctSubjects - maxDistinctSubjectsPerClassWeek) * 14
        }
      }

      for (const [maLop, weeks] of classToWeeks.entries()) {
        const uniqueWeeks = Array.from(new Set(weeks)).sort((a, b) => a - b)
        if (!uniqueWeeks.length) continue

        const minWeek = uniqueWeeks[0]
        const maxWeek = uniqueWeeks[uniqueWeeks.length - 1]
        for (let w = minWeek; w <= maxWeek; w += 1) {
          if (!uniqueWeeks.includes(w)) {
            penalty += enforceBalancedWorkload ? 4 : 1
          }
        }

        if (enforceBalancedWorkload) {
          const loads = uniqueWeeks.map((week) => decoded.classWeekLoad.get(`${maLop}_${week}`) || 0)
          const avg = loads.reduce((sum, value) => sum + value, 0) / Math.max(1, loads.length)
          const variance = loads.reduce((sum, value) => sum + Math.pow(value - avg, 2), 0) / Math.max(1, loads.length)
          penalty += Math.sqrt(variance) * 5
        }
      }

      // Tinh phuong sai tai giao vien de uu tien can bang
      if (enforceBalancedWorkload) {
        const teacherLoads = Array.from(decoded.teacherWeekLoad.values())
        if (teacherLoads.length > 1) {
          const avgTeacherLoad = teacherLoads.reduce((sum, v) => sum + v, 0) / teacherLoads.length
          const teacherVariance = teacherLoads.reduce((sum, v) => sum + Math.pow(v - avgTeacherLoad, 2), 0) / teacherLoads.length
          penalty += Math.sqrt(teacherVariance) * 8
        }
        for (const [, load] of decoded.teacherWeekLoad.entries()) {
          if (load > 15) penalty += (load - 15) * 9
        }
      } else {
        for (const [, load] of decoded.teacherWeekLoad.entries()) {
          if (load > 22) penalty += (load - 22) * 2
        }
      }

      // Soft target: phat neu tai vuot qua muc tieu (khong phai hard limit)
      const avgClassLoad = decoded.classWeekLoad.size > 0
        ? Array.from(decoded.classWeekLoad.values()).reduce((sum, v) => sum + v, 0) / decoded.classWeekLoad.size
        : 14
      const softTargetClassLoad = Math.max(12, avgClassLoad * 0.85)
      for (const [, load] of decoded.classWeekLoad.entries()) {
        if (enforceBalancedWorkload && load > softTargetClassLoad + 8) {
          // Phat nhe neu vuot soft target + margin, nhung khong hard-block
          penalty += (load - softTargetClassLoad - 8) * 2
        }
      }

      for (const item of decoded.selected) {
        if (!item) continue
        const list = courseRunWeeks.get(item.task.courseRunKey) || []
        list.push(item.candidate.weekIndex)
        courseRunWeeks.set(item.task.courseRunKey, list)
        penalty += Math.abs(item.candidate.weekIndex - item.task.targetWeekIndex) * (enforceBalancedWorkload ? 3.2 : 1.6)
      }

      for (const [courseRunKey, weeks] of courseRunWeeks.entries()) {
        const orderedWeeks = [...weeks].sort((a, b) => a - b)
        for (let i = 1; i < orderedWeeks.length; i += 1) {
          const gap = orderedWeeks[i] - orderedWeeks[i - 1]
          if (enforceBalancedWorkload) {
            if (gap <= 0) {
              penalty += 20
            } else if (gap > 3) {
              penalty += (gap - 3) * 6
            }
          } else if (gap > 5) {
            penalty += (gap - 5) * 2
          }
        }

        const sampleTask = tasksSorted.find((task) => task.courseRunKey === courseRunKey)
        if (!sampleTask) continue

        for (const [weekKey, count] of decoded.courseWeekCount.entries()) {
          if (!weekKey.startsWith(`${courseRunKey}_`)) continue
          const weeklyCap = getCourseWeeklyCap(sampleTask)
          if (enforceBalancedWorkload && count > weeklyCap) {
            penalty += (count - weeklyCap) * 18
          }
        }
      }

      for (const [pairKey, practiceWeek] of decoded.practiceWeekByKey.entries()) {
        const theoryWeek = decoded.theoryWeekByKey.get(pairKey)
        if (theoryWeek === undefined) {
          penalty += 40
          continue
        }
        if (practiceWeek < theoryWeek) {
          penalty += 120 + (theoryWeek - practiceWeek) * 15
        }
      }

      return score - penalty
    }

    const tournamentPick = (population: number[][], fitness: number[]) => {
      const size = Math.min(4, population.length)
      let bestIndex = Math.floor(Math.random() * population.length)
      for (let i = 1; i < size; i += 1) {
        const idx = Math.floor(Math.random() * population.length)
        if (fitness[idx] > fitness[bestIndex]) bestIndex = idx
      }
      return population[bestIndex]
    }

    const crossover = (a: number[], b: number[]) => {
      if (a.length <= 1) return [...a]
      const point = Math.max(1, Math.min(a.length - 1, Math.floor(Math.random() * a.length)))
      return [...a.slice(0, point), ...b.slice(point)]
    }

    const mutate = (chromosome: number[]) => {
      for (let i = 0; i < chromosome.length; i += 1) {
        if (Math.random() > 0.12) continue
        const candidates = candidateByTask[i]
        if (!candidates.length) {
          chromosome[i] = -1
          continue
        }
        chromosome[i] = Math.floor(Math.random() * Math.min(candidates.length, chromosomeGeneSpan))
      }
      return chromosome
    }

    const populationSize = isLargeWorkload ? 14 : taskCount >= 350 ? 20 : 28
    const generations = isLargeWorkload ? 14 : taskCount >= 350 ? 24 : 36
    const eliteCount = Math.max(4, Math.floor(populationSize * 0.22))
    const gaDeadline = Date.now() + (isLargeWorkload ? 12000 : 28000)
    let population: number[][] = Array.from({ length: populationSize }, () => randomChromosome())
    let bestFitnessEver = Number.NEGATIVE_INFINITY
    let stagnantGenerations = 0

    for (let generation = 0; generation < generations; generation += 1) {
      const fitness = population.map((individual) => evaluateChromosome(individual))
      const ranked = population
        .map((individual, index) => ({ individual, fit: fitness[index] }))
        .sort((a, b) => b.fit - a.fit)

      if (ranked[0]?.fit > bestFitnessEver) {
        bestFitnessEver = ranked[0].fit
        stagnantGenerations = 0
      } else {
        stagnantGenerations += 1
      }

      if (Date.now() > gaDeadline && generation >= 4) {
        warnings.push(`Khối lượng lớn: dừng GA sớm ở thế hệ ${generation + 1} để đảm bảo thời gian phản hồi`)
        population = ranked.map((item) => item.individual)
        break
      }

      if (stagnantGenerations >= 6 && generation >= 8) {
        population = ranked.map((item) => item.individual)
        break
      }

      const nextPopulation: number[][] = ranked.slice(0, eliteCount).map((item) => [...item.individual])

      while (nextPopulation.length < populationSize) {
        const parentA = tournamentPick(population, fitness)
        const parentB = tournamentPick(population, fitness)
        const child = mutate(crossover(parentA, parentB))
        nextPopulation.push(child)
      }

      population = nextPopulation

      if (generation % 6 === 0) {
        const dynamicProgress = 60 + Math.round((generation / Math.max(1, generations - 1)) * 20)
        job.progress = Math.max(job.progress, dynamicProgress)
      }
    }

    const finalFitness = population.map((individual) => evaluateChromosome(individual))
    let bestIndex = 0
    for (let i = 1; i < finalFitness.length; i += 1) {
      if (finalFitness[i] > finalFitness[bestIndex]) bestIndex = i
    }
    const bestChromosome = population[bestIndex]

    const decodedBest = decodeChromosome(bestChromosome)

    // Pass: Rebalancing - dich chuyen task tu tuan nang sang tuan nhe neu khong gay xung dot
    if (enforceBalancedWorkload) {
      const classWeekLoads = new Map<string, number>(decodedBest.classWeekLoad)
      const teacherWeekLoads = new Map<string, number>(decodedBest.teacherWeekLoad)
      const classWeekSubjects = new Map<string, Set<number>>(decodedBest.classWeekSubjects)

      for (const item of decodedBest.selected) {
        if (!item) continue
        const task = item.task
        const candidate = item.candidate
        const currentWeekKey = `${task.maLop}_${candidate.weekIndex}`
        const currentLoad = classWeekLoads.get(currentWeekKey) || 0
        const avgClassLoad = Array.from(classWeekLoads.values()).reduce((s, v) => s + v, 0) / Math.max(1, classWeekLoads.size)

        // Neu tuan hien tai qua nang (vuot 20% tren average) va co tuan nhe hon, thu chuyen
        if (currentLoad > avgClassLoad * 1.2) {
          let bestLighterWeek = -1
          for (let w = 0; w < 18; w++) {
            const targetWeekKey = `${task.maLop}_${w}`
            const targetLoad = classWeekLoads.get(targetWeekKey) || 0
            if (targetLoad < currentLoad - 2) {
              const targetSubjects = classWeekSubjects.get(targetWeekKey) || new Set<number>()
              // Tranh xep hai mon cung loai trong mot tuan neu co the
              if (!targetSubjects.has(task.maMon)) {
                bestLighterWeek = w
                break
              }
            }
          }

          if (bestLighterWeek >= 0) {
            // Xoa tu tuan cu
            classWeekLoads.set(currentWeekKey, currentLoad - task.soTietDay)
            const currentWeekSubjects = classWeekSubjects.get(currentWeekKey) || new Set<number>()
            currentWeekSubjects.delete(task.maMon)
            if (currentWeekSubjects.size === 0) classWeekSubjects.delete(currentWeekKey)

            // Them vao tuan moi
            const targetWeekKey = `${task.maLop}_${bestLighterWeek}`
            classWeekLoads.set(targetWeekKey, (classWeekLoads.get(targetWeekKey) || 0) + task.soTietDay)
            const targetWeekSubjects = classWeekSubjects.get(targetWeekKey) || new Set<number>()
            targetWeekSubjects.add(task.maMon)
            classWeekSubjects.set(targetWeekKey, targetWeekSubjects)

            // Cap nhat item (gia lap: danh dau da xoc)
            item.candidate.weekIndex = bestLighterWeek
          }
        }
      }
    }

    const assignments: Assignment[] = decodedBest.selected
      .filter((item): item is { task: Task; candidate: Candidate } => Boolean(item))
      .map((item) => item.candidate.assignment)

    const assignedTaskIds = new Set(
      decodedBest.selected
        .filter((item): item is { task: Task; candidate: Candidate } => Boolean(item))
        .map((item) => item.task.taskId)
    )

    const teacherBusyFinal = new Set<string>()
    const classBusyFinal = new Set<string>()
    const roomBusyFinal = new Set<string>()
    const classDayBusyFinal = new Set<string>()
    const classSubjectDayBusyFinal = new Set<string>()
    const classWeekLoadFinal = new Map<string, number>()
    const teacherWeekLoadFinal = new Map<string, number>()
    const courseWeekCountFinal = new Map<string, number>()
    const classWeekSubjectsFinal = new Map<string, Set<number>>()
    const lastWeekByCourseRunFinal = new Map<string, number>()
    const theoryWeekByKeyFinal = new Map<string, number>()
    const latestTheoryWeekByKeyFinal = new Map<string, number>()
    const latestTheoryMomentByKeyFinal = new Map<string, number>()
    const theoryAssignedPeriodsByPairFinal = new Map<string, number>()
    const recurringTemplateByCourseRunFinal = new Map<string, { weekday: number; session: string; maGV: number; maPhong: number }>()
    const forcedConflictAssignments: Array<{ taskId: string; courseName: string; className: string; conflictCount: number }> = []

    for (const item of decodedBest.selected) {
      if (!item) continue
      item.candidate.teacherKeys.forEach((key) => teacherBusyFinal.add(key))
      item.candidate.classKeys.forEach((key) => classBusyFinal.add(key))
      item.candidate.roomKeys.forEach((key) => roomBusyFinal.add(key))
      classDayBusyFinal.add(`${item.task.maLop}_${item.candidate.weekIndex}_${toWeekDayIndex(item.candidate.assignment.ngayDay)}`)
      classSubjectDayBusyFinal.add(`${item.task.maLop}_${item.task.maMon}_${item.candidate.assignment.ngayDay.toISOString().slice(0, 10)}`)
      classWeekLoadFinal.set(
        `${item.task.maLop}_${item.candidate.weekIndex}`,
        (classWeekLoadFinal.get(`${item.task.maLop}_${item.candidate.weekIndex}`) || 0) + item.task.soTietDay,
      )
      teacherWeekLoadFinal.set(
        `${item.candidate.assignment.maGV}_${item.candidate.weekIndex}`,
        (teacherWeekLoadFinal.get(`${item.candidate.assignment.maGV}_${item.candidate.weekIndex}`) || 0) + item.task.soTietDay,
      )
      courseWeekCountFinal.set(
        `${item.task.courseRunKey}_${item.candidate.weekIndex}`,
        (courseWeekCountFinal.get(`${item.task.courseRunKey}_${item.candidate.weekIndex}`) || 0) + 1,
      )
      const classWeekSubjectKey = `${item.task.maLop}_${item.candidate.weekIndex}`
      const weekSubjects = classWeekSubjectsFinal.get(classWeekSubjectKey) || new Set<number>()
      weekSubjects.add(item.task.maMon)
      classWeekSubjectsFinal.set(classWeekSubjectKey, weekSubjects)
      lastWeekByCourseRunFinal.set(
        item.task.courseRunKey,
        Math.max(lastWeekByCourseRunFinal.get(item.task.courseRunKey) ?? -1, item.candidate.weekIndex),
      )
      if (!item.task.isPractice) {
        const pairKey = getTheoryPracticePairKey(item.task)
        theoryWeekByKeyFinal.set(
          pairKey,
          Math.min(theoryWeekByKeyFinal.get(pairKey) ?? item.candidate.weekIndex, item.candidate.weekIndex),
        )
        latestTheoryWeekByKeyFinal.set(
          pairKey,
          Math.max(latestTheoryWeekByKeyFinal.get(pairKey) ?? -1, item.candidate.weekIndex),
        )
        latestTheoryMomentByKeyFinal.set(
          pairKey,
          Math.max(
            latestTheoryMomentByKeyFinal.get(pairKey) ?? -1,
            getAssignmentMomentOrder(item.candidate.assignment.ngayDay, item.candidate.assignment.buoi),
          ),
        )
        theoryAssignedPeriodsByPairFinal.set(pairKey, (theoryAssignedPeriodsByPairFinal.get(pairKey) || 0) + item.task.soTietDay)
      }
      if (!recurringTemplateByCourseRunFinal.has(item.task.courseRunKey) && shouldEnforceRecurringTemplateForTask(item.task)) {
        recurringTemplateByCourseRunFinal.set(item.task.courseRunKey, {
          weekday: item.candidate.assignment.ngayDay.getDay(),
          session: item.candidate.assignment.buoi,
          maGV: item.candidate.assignment.maGV,
          maPhong: item.candidate.assignment.maPhong,
        })
      }
    }

    // Helper to commit a repaired candidate into the tracking state
    const commitRepairedCandidate = (task: Task, candidate: Candidate) => {
      const repairDateKey = candidate.assignment.ngayDay.toISOString().slice(0, 10)
      assignments.push(candidate.assignment)
      assignedTaskIds.add(task.taskId)
      candidate.teacherKeys.forEach((key) => teacherBusyFinal.add(key))
      candidate.classKeys.forEach((key) => classBusyFinal.add(key))
      candidate.roomKeys.forEach((key) => roomBusyFinal.add(key))
      classDayBusyFinal.add(`${task.maLop}_${candidate.weekIndex}_${toWeekDayIndex(candidate.assignment.ngayDay)}`)
      classSubjectDayBusyFinal.add(`${task.maLop}_${task.maMon}_${repairDateKey}`)
      classWeekLoadFinal.set(
        `${task.maLop}_${candidate.weekIndex}`,
        (classWeekLoadFinal.get(`${task.maLop}_${candidate.weekIndex}`) || 0) + task.soTietDay,
      )
      teacherWeekLoadFinal.set(
        `${candidate.assignment.maGV}_${candidate.weekIndex}`,
        (teacherWeekLoadFinal.get(`${candidate.assignment.maGV}_${candidate.weekIndex}`) || 0) + task.soTietDay,
      )
      courseWeekCountFinal.set(
        `${task.courseRunKey}_${candidate.weekIndex}`,
        (courseWeekCountFinal.get(`${task.courseRunKey}_${candidate.weekIndex}`) || 0) + 1,
      )
      const classWeekSubjectKey = `${task.maLop}_${candidate.weekIndex}`
      const weekSubjects = classWeekSubjectsFinal.get(classWeekSubjectKey) || new Set<number>()
      weekSubjects.add(task.maMon)
      classWeekSubjectsFinal.set(classWeekSubjectKey, weekSubjects)
      lastWeekByCourseRunFinal.set(
        task.courseRunKey,
        Math.max(lastWeekByCourseRunFinal.get(task.courseRunKey) ?? -1, candidate.weekIndex),
      )
      // Also track theory weeks so repair pass can enforce theory-before-practice
      if (!task.isPractice) {
        const pk = getTheoryPracticePairKey(task)
        const prev = theoryWeekByKeyFinal.get(pk)
        theoryWeekByKeyFinal.set(pk, prev === undefined ? candidate.weekIndex : Math.min(prev, candidate.weekIndex))
        latestTheoryWeekByKeyFinal.set(pk, Math.max(latestTheoryWeekByKeyFinal.get(pk) ?? -1, candidate.weekIndex))
        latestTheoryMomentByKeyFinal.set(
          pk,
          Math.max(
            latestTheoryMomentByKeyFinal.get(pk) ?? -1,
            getAssignmentMomentOrder(candidate.assignment.ngayDay, candidate.assignment.buoi),
          ),
        )
        theoryAssignedPeriodsByPairFinal.set(pk, (theoryAssignedPeriodsByPairFinal.get(pk) || 0) + task.soTietDay)
      }
      if (!recurringTemplateByCourseRunFinal.has(task.courseRunKey) && shouldEnforceRecurringTemplateForTask(task)) {
        recurringTemplateByCourseRunFinal.set(task.courseRunKey, {
          weekday: candidate.assignment.ngayDay.getDay(),
          session: candidate.assignment.buoi,
          maGV: candidate.assignment.maGV,
          maPhong: candidate.assignment.maPhong,
        })
      }
    }

    const commitForcedConflictCandidate = (task: Task, candidate: Candidate, conflictCount: number) => {
      commitRepairedCandidate(task, candidate)
      forcedConflictAssignments.push({
        taskId: task.taskId,
        courseName: task.courseName,
        className: String(classById.get(Number(task.maLop))?.TenLop || `Lớp ${task.maLop}`),
        conflictCount,
      })
    }

    const repairOrder = tasksSorted
      .map((task, index) => ({ task, index, candidateCount: candidateByTask[index]?.length || 0 }))
      .filter((item) => !assignedTaskIds.has(item.task.taskId))
      .sort((a, b) => a.candidateCount - b.candidateCount)

    // Pass 1: Normal repair â€” relaxes week-order but keeps hard conflicts (teacher/class/room busy)
    for (const repairItem of repairOrder) {
      const task = repairItem.task
      if (assignedTaskIds.has(task.taskId)) continue

      const candidates = candidateByTask[repairItem.index]
      let bestRepairCandidate: Candidate | null = null
      let bestRepairScore = Number.NEGATIVE_INFINITY

      for (const candidate of candidates) {
        const dateKey = candidate.assignment.ngayDay.toISOString().slice(0, 10)
        const classSubjectDayKey = `${task.maLop}_${task.maMon}_${dateKey}`
        const classInfo = classById.get(Number(task.maLop))
        const classSize = Number(classInfo?.SiSo || 0)
        const roomInfo = roomById.get(Number(candidate.assignment.maPhong))
        const roomCapacity = Number(roomInfo?.SucChua || 0)
        const currentClassWeekLoad = classWeekLoadFinal.get(`${task.maLop}_${candidate.weekIndex}`) || 0
        const currentTeacherWeekLoad = teacherWeekLoadFinal.get(`${candidate.assignment.maGV}_${candidate.weekIndex}`) || 0
        const classWeekSubjectKey = `${task.maLop}_${candidate.weekIndex}`
        const subjectsInWeek = classWeekSubjectsFinal.get(classWeekSubjectKey) || new Set<number>()
        const isNewSubjectInWeek = !subjectsInWeek.has(task.maMon)
        const lastCourseWeek = lastWeekByCourseRunFinal.get(task.courseRunKey)
        const recurringTemplate = recurringTemplateByCourseRunFinal.get(task.courseRunKey)
        const candidateWeekday = candidate.assignment.ngayDay.getDay()

        if (recurringTemplate && shouldEnforceRecurringTemplateForTask(task)) {
          if (
            recurringTemplate.weekday !== candidateWeekday ||
            recurringTemplate.session !== candidate.assignment.buoi ||
            recurringTemplate.maGV !== candidate.assignment.maGV ||
            recurringTemplate.maPhong !== candidate.assignment.maPhong
          ) {
            continue
          }
        }

        if (lastCourseWeek !== undefined && candidate.weekIndex < lastCourseWeek) continue

        // Hard conflicts only: time/room collisions and class-day constraint
        const hardConflict =
          candidate.teacherKeys.some((key) => teacherBusyFinal.has(key)) ||
          candidate.classKeys.some((key) => classBusyFinal.has(key)) ||
          candidate.roomKeys.some((key) => roomBusyFinal.has(key))
        const sameSubjectSameDay = classSubjectDayBusyFinal.has(classSubjectDayKey)

        if (
          (enforceConflictRules && hardConflict) ||
          currentClassWeekLoad + task.soTietDay > (enforceBalancedWorkload ? 25 : 32) ||
          currentTeacherWeekLoad + task.soTietDay > (enforceBalancedWorkload ? 25 : 32) ||
          (enforceBalancedWorkload && isNewSubjectInWeek && subjectsInWeek.size >= maxDistinctSubjectsPerClassWeek) ||
          (enforceRoomOptimization && classSize > 0 && roomCapacity > 0 && roomCapacity < classSize) ||
          (task.isPractice && !roomMatchesPreferredType(roomInfo?.LoaiPhong, task.preferredRoomType))
        ) {
          continue
        }

        let repairScore = candidate.staticScore
        repairScore -= candidate.weekDistance * 2.8
        repairScore -= currentClassWeekLoad * 1.2
        repairScore -= currentTeacherWeekLoad * 1.15
        if (!enforceConflictRules && hardConflict) repairScore -= 8
        if (sameSubjectSameDay) repairScore -= enforceBalancedWorkload ? 3.8 : 2
        if (isNewSubjectInWeek) repairScore -= subjectsInWeek.size * (enforceBalancedWorkload ? 2 : 0.8)

        // Soft week-order preference
        if (enforceBalancedWorkload && lastCourseWeek !== undefined) {
          const gap = candidate.weekIndex - lastCourseWeek
          if (gap < 0) repairScore -= 10
          else if (gap === 0) repairScore -= 3
          else if (gap === 1) repairScore += 3
          else if (gap > 3) repairScore -= (gap - 3) * 2
        }

        if (task.isPractice && pairKeysWithBothTheoryAndPractice.has(getTheoryPracticePairKey(task))) {
          const pairKey = getTheoryPracticePairKey(task)
          const latestTheoryMoment = latestTheoryMomentByKeyFinal.get(pairKey)
          const candidateMoment = getAssignmentMomentOrder(candidate.assignment.ngayDay, candidate.assignment.buoi)
          if (latestTheoryMoment !== undefined && candidateMoment <= latestTheoryMoment) continue
        }

        if (repairScore > bestRepairScore) {
          bestRepairScore = repairScore
          bestRepairCandidate = candidate
        }
      }

      if (bestRepairCandidate) {
        commitRepairedCandidate(task, bestRepairCandidate)
      }
    }

    // Pass 2: Last-resort repair â€” for still-unassigned tasks, relax constraints
    const stillUnassigned = tasksSorted.filter((task) => !assignedTaskIds.has(task.taskId))

    for (const task of stillUnassigned) {
      if (assignedTaskIds.has(task.taskId)) continue

      const taskIndex = tasksSorted.indexOf(task)
      const existingCandidates = candidateByTask[taskIndex] || []

      let bestLastResort: Candidate | null = null
      let bestLastResortScore = Number.NEGATIVE_INFINITY

      // First: try any existing candidate ignoring week-load constraints
      for (const candidate of existingCandidates) {
        const dateKey = candidate.assignment.ngayDay.toISOString().slice(0, 10)
        const classSubjectDayKey = `${task.maLop}_${task.maMon}_${dateKey}`
        const recurringTemplate = recurringTemplateByCourseRunFinal.get(task.courseRunKey)
        const candidateWeekday = candidate.assignment.ngayDay.getDay()

        if (recurringTemplate && shouldEnforceRecurringTemplateForTask(task)) {
          if (
            recurringTemplate.weekday !== candidateWeekday ||
            recurringTemplate.session !== candidate.assignment.buoi ||
            recurringTemplate.maGV !== candidate.assignment.maGV ||
            recurringTemplate.maPhong !== candidate.assignment.maPhong
          ) {
            continue
          }
        }

        const lastCourseWeek = lastWeekByCourseRunFinal.get(task.courseRunKey)
        if (lastCourseWeek !== undefined && candidate.weekIndex < lastCourseWeek) continue

        if (task.isPractice && pairKeysWithBothTheoryAndPractice.has(getTheoryPracticePairKey(task))) {
          const pairKey = getTheoryPracticePairKey(task)
          const latestTheoryMoment = latestTheoryMomentByKeyFinal.get(pairKey)
          const candidateMoment = getAssignmentMomentOrder(candidate.assignment.ngayDay, candidate.assignment.buoi)
          if (latestTheoryMoment !== undefined && candidateMoment <= latestTheoryMoment) continue
        }

        // Only hard conflicts: same period for teacher/class/room and class-day duplicate
        if (
          enforceConflictRules && (
            candidate.teacherKeys.some((key) => teacherBusyFinal.has(key)) ||
            candidate.classKeys.some((key) => classBusyFinal.has(key)) ||
            candidate.roomKeys.some((key) => roomBusyFinal.has(key))
          )
        ) {
          continue
        }

        const sameSubjectSameDay = classSubjectDayBusyFinal.has(classSubjectDayKey)
        const score = -candidate.weekDistance * 2 - (sameSubjectSameDay ? 2 : 0)
        if (score > bestLastResortScore) {
          bestLastResortScore = score
          bestLastResort = candidate
        }
      }

      if (bestLastResort) {
        commitRepairedCandidate(task, bestLastResort)
        continue
      }

      // If still no candidate, try one more ultra-limited search: first teacher, rotated rooms, key weeks only
      const semester = semesterById.get(task.maHK)
      if (!semester) continue

      const semesterWindow = semesterWindowById.get(semester.MaHK) || buildEffectiveSemesterWindow(semester, semesterCountByYear)
      const weekStarts = buildWeekStarts(semesterWindow.start, semesterWindow.end)

      const eligibleTeachers = (expertiseByCourse.get(task.maMon) || [])
        .filter((maGV) => instructors.some((gv) => gv.MaGV === maGV))
      const teacherPool = eligibleTeachers
      if (teacherPool.length === 0) continue

      // Ultra-limited search: pick first available teacher, limited room set, and sample weeks
      // Practice tasks ALWAYS require practice rooms (hard constraint)
      const matchingRooms = (enforceRoomOptimization || task.isPractice)
        ? rooms.filter((room) => roomMatchesPreferredType(room.LoaiPhong, task.preferredRoomType))
        : rooms
      const lastResortRooms = rotatePool(
        matchingRooms.length > 0 ? matchingRooms : rooms,
        3,
        task.maLop + task.maMon,
      )

      const sampleWeeks = [task.targetWeekIndex, Math.max(0, task.targetWeekIndex - 1), Math.min(weekStarts.length - 1, task.targetWeekIndex + 1), 0, weekStarts.length - 1]
      const uniqueSampleWeeks = Array.from(new Set(sampleWeeks.filter((w) => w >= 0 && w < weekStarts.length)))

      const dayOrder = [1, 2, 3, 4, 5, 6, 7]
      const firstTeacher = teacherPool[0]
      const recurringTemplate = recurringTemplateByCourseRunFinal.get(task.courseRunKey)

      for (const weekIndex of uniqueSampleWeeks) {
        for (const day of dayOrder) {
          for (const slot of SLOT_OPTIONS) {
            const slotPeriods = resolveSlotPeriods(slot.label)
            if (slotPeriods.length < task.soTietDay) continue

            const date = new Date(weekStarts[weekIndex])
            date.setDate(date.getDate() + (day - 1))
            date.setHours(12, 0, 0, 0)

            if (recurringTemplate && shouldEnforceRecurringTemplateForTask(task)) {
              const candidateWeekday = date.getDay()
              if (candidateWeekday !== recurringTemplate.weekday) continue
              if (slot.label !== recurringTemplate.session) continue
              if (firstTeacher !== recurringTemplate.maGV) continue
            }

            for (const room of lastResortRooms) {
              if (recurringTemplate && shouldEnforceRecurringTemplateForTask(task) && room.MaPhong !== recurringTemplate.maPhong) continue
              const dateKey = date.toISOString().slice(0, 10)
              const classSubjectDayKey = `${task.maLop}_${task.maMon}_${dateKey}`

              const teacherKey = `${firstTeacher}_${weekIndex}_${day}`
              const classKey = `${task.maLop}_${weekIndex}_${day}`
              const roomKey = `${room.MaPhong}_${weekIndex}_${day}`

              // Check only hard conflicts on main parts of time slot (if enabled)
              let hasConflict = false
              for (const period of slotPeriods) {
                if (teacherBusyFinal.has(`${firstTeacher}_${weekIndex}_${day}_${period}`) ||
                    classBusyFinal.has(`${task.maLop}_${weekIndex}_${day}_${period}`) ||
                    roomBusyFinal.has(`${room.MaPhong}_${weekIndex}_${day}_${period}`)) {
                  hasConflict = true
                  break
                }
              }

              if (enforceConflictRules && hasConflict) continue

              if (task.isPractice && pairKeysWithBothTheoryAndPractice.has(getTheoryPracticePairKey(task))) {
                const pairKey = getTheoryPracticePairKey(task)
                const latestTheoryMoment = latestTheoryMomentByKeyFinal.get(pairKey)
                const candidateMoment = getAssignmentMomentOrder(date, slot.label)
                if (latestTheoryMoment !== undefined && candidateMoment <= latestTheoryMoment) continue
              }

              const sameSubjectSameDay = classSubjectDayBusyFinal.has(classSubjectDayKey)
              const score = -Math.abs(weekIndex - task.targetWeekIndex) - (sameSubjectSameDay ? 2 : 0)
              if (score > bestLastResortScore) {
                bestLastResortScore = score
                bestLastResort = {
                  assignment: {
                    maLop: task.maLop,
                    maMon: task.maMon,
                    maGV: firstTeacher,
                    maPhong: room.MaPhong,
                    ngayDay: date,
                    soTietDay: task.soTietDay,
                    hocKyDay: task.hocKyDay,
                    buoi: slot.label,
                    tuan: `Tuần ${getWeekOfYear(date)}`,
                  },
                  weekIndex,
                  staticScore: score,
                  weekDistance: Math.abs(weekIndex - task.targetWeekIndex),
                  teacherKeys: slotPeriods.map((period) => `${firstTeacher}_${weekIndex}_${day}_${period}`),
                  classKeys: slotPeriods.map((period) => `${task.maLop}_${weekIndex}_${day}_${period}`),
                  roomKeys: slotPeriods.map((period) => `${room.MaPhong}_${weekIndex}_${day}_${period}`),
                }
              }
            }
          }
        }
      }

      if (bestLastResort) {
        commitRepairedCandidate(task, bestLastResort)
      }
    }

    // Pass 3: Completion rescue â€” broaden search space for any still-unassigned tasks
    // while keeping core hard constraints intact. This pass uses staged relaxation
    // of recurring-template rigidity only when stricter stage finds no feasible slot.
    const finalUnassigned = tasksSorted.filter((task) => !assignedTaskIds.has(task.taskId))
    for (const task of finalUnassigned) {
      if (assignedTaskIds.has(task.taskId)) continue

      const semester = semesterById.get(task.maHK)
      if (!semester) continue

      const semesterWindow = semesterWindowById.get(semester.MaHK) || buildEffectiveSemesterWindow(semester, semesterCountByYear)
      const weekStarts = buildWeekStarts(semesterWindow.start, semesterWindow.end)
      if (weekStarts.length === 0) continue

      const eligibleTeachers = (expertiseByCourse.get(task.maMon) || [])
        .filter((maGV) => instructors.some((gv) => gv.MaGV === maGV))
      const teacherCandidates = Array.from(new Set(
        eligibleTeachers.filter((value) => Number.isFinite(value))
      ))
      if (teacherCandidates.length === 0) continue

      const matchingRooms = (enforceRoomOptimization || task.isPractice)
        ? rooms.filter((room) => roomMatchesPreferredType(room.LoaiPhong, task.preferredRoomType))
        : rooms
      const roomCandidates = matchingRooms.length > 0 ? matchingRooms : rooms
      if (roomCandidates.length === 0) continue

      const recurringTemplate = recurringTemplateByCourseRunFinal.get(task.courseRunKey)
      const lastCourseWeek = lastWeekByCourseRunFinal.get(task.courseRunKey)
      const weekOrder = buildWeekPreferenceOrder(weekStarts.length, task.targetWeekIndex)
      const templateStages = recurringTemplate
        ? [
            { keepWeekday: true, keepSession: true, keepTeacher: true, keepRoom: true, allowSunday: false, teacherCap: 1, roomCap: 1 },
            { keepWeekday: true, keepSession: true, keepTeacher: true, keepRoom: false, allowSunday: false, teacherCap: 1, roomCap: 24 },
            { keepWeekday: true, keepSession: true, keepTeacher: false, keepRoom: false, allowSunday: true, teacherCap: 18, roomCap: 30 },
            { keepWeekday: false, keepSession: false, keepTeacher: false, keepRoom: false, allowSunday: true, teacherCap: 24, roomCap: 40 },
          ]
        : [
            { keepWeekday: false, keepSession: false, keepTeacher: false, keepRoom: false, allowSunday: true, teacherCap: 24, roomCap: 40 },
          ]

      let bestCompletionCandidate: Candidate | null = null

      stageLoop:
      for (let stageIndex = 0; stageIndex < templateStages.length; stageIndex += 1) {
        const stage = templateStages[stageIndex]
        const teacherPool = rotatePool(teacherCandidates, Math.min(stage.teacherCap, teacherCandidates.length), task.maLop + task.maMon + stageIndex)
        const roomPool = rotatePool(roomCandidates, Math.min(stage.roomCap, roomCandidates.length), task.maLop + task.maMon + task.chunkIndex + stageIndex)
        const dayOrder = stage.allowSunday ? [1, 2, 3, 4, 5, 6, 7] : [1, 2, 3, 4, 5, 6]

        let bestStageCandidate: Candidate | null = null
        let bestStageScore = Number.NEGATIVE_INFINITY

        for (const weekIndex of weekOrder) {
          for (const day of dayOrder) {
            for (const slot of SLOT_OPTIONS) {
              const slotPeriods = resolveSlotPeriods(slot.label)
              if (slotPeriods.length < task.soTietDay) continue

              const date = new Date(weekStarts[weekIndex])
              date.setDate(date.getDate() + (day - 1))
              date.setHours(12, 0, 0, 0)
              const candidateWeekday = date.getDay()

              if (recurringTemplate && stage.keepWeekday && recurringTemplate.weekday !== candidateWeekday) continue
              if (recurringTemplate && stage.keepSession && recurringTemplate.session !== slot.label) continue
              if (lastCourseWeek !== undefined && weekIndex < lastCourseWeek) continue

              for (const maGV of teacherPool) {
                if (recurringTemplate && stage.keepTeacher && recurringTemplate.maGV !== maGV) continue

                for (const room of roomPool) {
                  if (recurringTemplate && stage.keepRoom && recurringTemplate.maPhong !== room.MaPhong) continue

                  const dateKey = date.toISOString().slice(0, 10)
                  const classSubjectDayKey = `${task.maLop}_${task.maMon}_${dateKey}`
                  const teacherKeys = slotPeriods.map((period) => `${maGV}_${weekIndex}_${day}_${period}`)
                  const classKeys = slotPeriods.map((period) => `${task.maLop}_${weekIndex}_${day}_${period}`)
                  const roomKeys = slotPeriods.map((period) => `${room.MaPhong}_${weekIndex}_${day}_${period}`)

                  const hardConflict =
                    teacherKeys.some((key) => teacherBusyFinal.has(key)) ||
                    classKeys.some((key) => classBusyFinal.has(key)) ||
                    roomKeys.some((key) => roomBusyFinal.has(key)) ||
                    classSubjectDayBusyFinal.has(classSubjectDayKey)

                  if (enforceConflictRules && hardConflict) continue

                  const classInfo = classById.get(Number(task.maLop))
                  const classSize = Number(classInfo?.SiSo || 0)
                  const roomCapacity = Number(room.SucChua || 0)
                  if (enforceRoomOptimization && classSize > 0 && roomCapacity > 0 && roomCapacity < classSize) continue
                  if (task.isPractice && !roomMatchesPreferredType(room.LoaiPhong, task.preferredRoomType)) continue

                  if (task.isPractice && pairKeysWithBothTheoryAndPractice.has(getTheoryPracticePairKey(task))) {
                    const pairKey = getTheoryPracticePairKey(task)
                    const latestTheoryMoment = latestTheoryMomentByKeyFinal.get(pairKey)
                    const candidateMoment = getAssignmentMomentOrder(date, slot.label)
                    if (latestTheoryMoment !== undefined && candidateMoment <= latestTheoryMoment) continue
                  }

                  const weekDistance = Math.abs(weekIndex - task.targetWeekIndex)
                  const score =
                    -weekDistance * 2 +
                    (hardConflict ? -6 : 0) +
                    (roomCapacity > 0 && classSize > 0 ? -Math.max(0, roomCapacity - classSize) * 0.01 : 0) -
                    stageIndex * 2.5

                  if (score > bestStageScore) {
                    bestStageScore = score
                    bestStageCandidate = {
                      assignment: {
                        maLop: task.maLop,
                        maMon: task.maMon,
                        maGV,
                        maPhong: room.MaPhong,
                        ngayDay: date,
                        soTietDay: task.soTietDay,
                        hocKyDay: task.hocKyDay,
                        buoi: slot.label,
                        tuan: `Tuần ${getWeekOfYear(date)}`,
                      },
                      weekIndex,
                      staticScore: score,
                      weekDistance,
                      teacherKeys,
                      classKeys,
                      roomKeys,
                    }
                  }
                }
              }
            }
          }
        }

        if (bestStageCandidate) {
          bestCompletionCandidate = bestStageCandidate
          break stageLoop
        }
      }

      if (bestCompletionCandidate) {
        commitRepairedCandidate(task, bestCompletionCandidate)
      }
    }

    // Pass 3.5: Compacting rescue â€” when tasks are still unassigned, pack them into
    // any empty slot that does NOT overlap class/teacher/room, ignoring soft constraints
    // such as recurring-template consistency, week monotonicity and weekly balancing.
    const compactingUnassigned = tasksSorted.filter((task) => !assignedTaskIds.has(task.taskId))
    for (const task of compactingUnassigned) {
      if (assignedTaskIds.has(task.taskId)) continue

      const taskIndex = tasksSorted.indexOf(task)
      const candidates = candidateByTask[taskIndex] || []
      let bestCompactCandidate: Candidate | null = null
      let bestCompactScore = Number.NEGATIVE_INFINITY

      for (const candidate of candidates) {
        const hasTeacherConflict = candidate.teacherKeys.some((key) => teacherBusyFinal.has(key))
        const hasClassConflict = candidate.classKeys.some((key) => classBusyFinal.has(key))
        const hasRoomConflict = candidate.roomKeys.some((key) => roomBusyFinal.has(key))
        if (hasTeacherConflict || hasClassConflict || hasRoomConflict) continue

        const classInfo = classById.get(Number(task.maLop))
        const classSize = Number(classInfo?.SiSo || 0)
        const roomInfo = roomById.get(Number(candidate.assignment.maPhong))
        const roomCapacity = Number(roomInfo?.SucChua || 0)
        if (enforceRoomOptimization && classSize > 0 && roomCapacity > 0 && roomCapacity < classSize) continue
        if (task.isPractice && !roomMatchesPreferredType(roomInfo?.LoaiPhong, task.preferredRoomType)) continue

        if (task.isPractice && pairKeysWithBothTheoryAndPractice.has(getTheoryPracticePairKey(task))) {
          const pairKey = getTheoryPracticePairKey(task)
          const latestTheoryMoment = latestTheoryMomentByKeyFinal.get(pairKey)
          const candidateMoment = getAssignmentMomentOrder(candidate.assignment.ngayDay, candidate.assignment.buoi)
          if (latestTheoryMoment !== undefined && candidateMoment <= latestTheoryMoment) continue
        }

        // Prefer candidates close to original target week and with better static score.
        const compactScore = candidate.staticScore - candidate.weekDistance * 1.2
        if (compactScore > bestCompactScore) {
          bestCompactScore = compactScore
          bestCompactCandidate = candidate
        }
      }

      if (bestCompactCandidate) {
        commitRepairedCandidate(task, bestCompactCandidate)
        continue
      }

      // If pre-generated candidates are exhausted, do a direct emergency search
      // across semester weeks while keeping only hard no-overlap constraints.
      const semester = semesterById.get(task.maHK)
      if (!semester) continue

      const semesterWindow = semesterWindowById.get(semester.MaHK) || buildEffectiveSemesterWindow(semester, semesterCountByYear)
      const weekStarts = buildWeekStarts(semesterWindow.start, semesterWindow.end)
      if (weekStarts.length === 0) continue

      const eligibleTeachers = (expertiseByCourse.get(task.maMon) || [])
        .filter((maGV) => instructors.some((gv) => gv.MaGV === maGV))
      const teacherPool = rotatePool(eligibleTeachers, Math.min(24, eligibleTeachers.length), task.maLop + task.maMon)
      if (teacherPool.length === 0) continue

      const matchingRooms = (enforceRoomOptimization || task.isPractice)
        ? rooms.filter((room) => roomMatchesPreferredType(room.LoaiPhong, task.preferredRoomType))
        : rooms
      const roomSource = matchingRooms.length > 0 ? matchingRooms : rooms
      const roomPool = rotatePool(roomSource, Math.min(48, roomSource.length), task.maLop + task.maMon + task.chunkIndex)
      if (roomPool.length === 0) continue

      const weekOrder = buildWeekPreferenceOrder(weekStarts.length, task.targetWeekIndex)
      const dayOrder = [1, 2, 3, 4, 5, 6, 7]

      for (const weekIndex of weekOrder) {
        for (const day of dayOrder) {
          for (const slot of SLOT_OPTIONS) {
            const slotPeriods = resolveSlotPeriods(slot.label)
            if (slotPeriods.length < task.soTietDay) continue

            const date = new Date(weekStarts[weekIndex])
            date.setDate(date.getDate() + (day - 1))
            date.setHours(12, 0, 0, 0)

            for (const maGV of teacherPool) {
              for (const room of roomPool) {
                const roomInfo = roomById.get(Number(room.MaPhong)) || room
                const classInfo = classById.get(Number(task.maLop))
                const classSize = Number(classInfo?.SiSo || 0)
                const roomCapacity = Number((roomInfo as any)?.SucChua || 0)
                if (enforceRoomOptimization && classSize > 0 && roomCapacity > 0 && roomCapacity < classSize) continue
                if (task.isPractice && !roomMatchesPreferredType((roomInfo as any)?.LoaiPhong, task.preferredRoomType)) continue

                const teacherKeys = slotPeriods.map((period) => `${maGV}_${weekIndex}_${day}_${period}`)
                const classKeys = slotPeriods.map((period) => `${task.maLop}_${weekIndex}_${day}_${period}`)
                const roomKeys = slotPeriods.map((period) => `${room.MaPhong}_${weekIndex}_${day}_${period}`)

                const hasTeacherConflict = teacherKeys.some((key) => teacherBusyFinal.has(key))
                const hasClassConflict = classKeys.some((key) => classBusyFinal.has(key))
                const hasRoomConflict = roomKeys.some((key) => roomBusyFinal.has(key))
                if (hasTeacherConflict || hasClassConflict || hasRoomConflict) continue

                if (task.isPractice && pairKeysWithBothTheoryAndPractice.has(getTheoryPracticePairKey(task))) {
                  const pairKey = getTheoryPracticePairKey(task)
                  const latestTheoryMoment = latestTheoryMomentByKeyFinal.get(pairKey)
                  const candidateMoment = getAssignmentMomentOrder(date, slot.label)
                  if (latestTheoryMoment !== undefined && candidateMoment <= latestTheoryMoment) continue
                }

                const directCandidate: Candidate = {
                  assignment: {
                    maLop: task.maLop,
                    maMon: task.maMon,
                    maGV,
                    maPhong: room.MaPhong,
                    ngayDay: date,
                    soTietDay: task.soTietDay,
                    hocKyDay: task.hocKyDay,
                    buoi: slot.label,
                    tuan: `Tuần ${getWeekOfYear(date)}`,
                  },
                  weekIndex,
                  staticScore: -Math.abs(weekIndex - task.targetWeekIndex),
                  weekDistance: Math.abs(weekIndex - task.targetWeekIndex),
                  teacherKeys,
                  classKeys,
                  roomKeys,
                }

                commitRepairedCandidate(task, directCandidate)
                bestCompactCandidate = directCandidate
                break
              }
              if (bestCompactCandidate) break
            }
            if (bestCompactCandidate) break
          }
          if (bestCompactCandidate) break
        }
        if (bestCompactCandidate) break
      }
    }

    // Pass 3.6: Empty-day rescue for still-unassigned tasks.
    // Keep all hard conflict constraints, but prioritize days in a week where the class has no schedule yet.
    // Allows Sunday and morning/afternoon sessions, and never schedules beyond semester end date.
    const emptyDayRescueUnassigned = tasksSorted.filter((task) => !assignedTaskIds.has(task.taskId))
    for (const task of emptyDayRescueUnassigned) {
      if (assignedTaskIds.has(task.taskId)) continue

      const semester = semesterById.get(task.maHK)
      if (!semester) continue

      const semesterWindow = semesterWindowById.get(semester.MaHK) || buildEffectiveSemesterWindow(semester, semesterCountByYear)
      const weekStarts = buildWeekStarts(semesterWindow.start, semesterWindow.end)
      if (weekStarts.length === 0) continue

      const eligibleTeachers = (expertiseByCourse.get(task.maMon) || [])
        .filter((maGV) => instructors.some((gv) => gv.MaGV === maGV))
      const teacherPool = rotatePool(eligibleTeachers, Math.min(20, eligibleTeachers.length), task.maLop + task.maMon)
      if (teacherPool.length === 0) continue

      const matchingRooms = (enforceRoomOptimization || task.isPractice)
        ? rooms.filter((room) => roomMatchesPreferredType(room.LoaiPhong, task.preferredRoomType))
        : rooms
      const roomSource = matchingRooms.length > 0 ? matchingRooms : rooms
      const roomPool = rotatePool(roomSource, Math.min(task.isPractice ? 40 : 60, roomSource.length), task.maLop + task.maMon + task.chunkIndex)
      if (roomPool.length === 0) continue

      const weekOrder = buildWeekPreferenceOrder(weekStarts.length, task.targetWeekIndex)
      const allDays = [1, 2, 3, 4, 5, 6, 7]
      let committed = false

      for (const weekIndex of weekOrder) {
        const emptyDays = allDays.filter((day) => !classDayBusyFinal.has(`${task.maLop}_${weekIndex}_${day}`))
        const nonEmptyDays = allDays.filter((day) => classDayBusyFinal.has(`${task.maLop}_${weekIndex}_${day}`))
        const dayOrder = [...emptyDays, ...nonEmptyDays]

        for (const day of dayOrder) {
          for (const slot of RESCUE_SLOT_OPTIONS) {
            const slotPeriods = resolveSlotPeriods(slot.label)
            if (slotPeriods.length < task.soTietDay) continue

            const date = new Date(weekStarts[weekIndex])
            date.setDate(date.getDate() + (day - 1))
            date.setHours(12, 0, 0, 0)

            if (date > semesterWindow.end) continue

            for (const maGV of teacherPool) {
              for (const room of roomPool) {
                const classInfo = classById.get(Number(task.maLop))
                const classSize = Number(classInfo?.SiSo || 0)
                const roomInfo = roomById.get(Number(room.MaPhong)) || room
                const roomCapacity = Number((roomInfo as any)?.SucChua || 0)
                if (enforceRoomOptimization && classSize > 0 && roomCapacity > 0 && roomCapacity < classSize) continue
                if (task.isPractice && !roomMatchesPreferredType((roomInfo as any)?.LoaiPhong, task.preferredRoomType)) continue

                const teacherKeys = slotPeriods.map((period) => `${maGV}_${weekIndex}_${day}_${period}`)
                const classKeys = slotPeriods.map((period) => `${task.maLop}_${weekIndex}_${day}_${period}`)
                const roomKeys = slotPeriods.map((period) => `${room.MaPhong}_${weekIndex}_${day}_${period}`)

                const hasTeacherConflict = teacherKeys.some((key) => teacherBusyFinal.has(key))
                const hasClassConflict = classKeys.some((key) => classBusyFinal.has(key))
                const hasRoomConflict = roomKeys.some((key) => roomBusyFinal.has(key))
                if (hasTeacherConflict || hasClassConflict || hasRoomConflict) continue

                const dateKey = date.toISOString().slice(0, 10)
                if (classSubjectDayBusyFinal.has(`${task.maLop}_${task.maMon}_${dateKey}`)) continue

                if (task.isPractice && pairKeysWithBothTheoryAndPractice.has(getTheoryPracticePairKey(task))) {
                  const pairKey = getTheoryPracticePairKey(task)
                  const latestTheoryMoment = latestTheoryMomentByKeyFinal.get(pairKey)
                  const candidateMoment = getAssignmentMomentOrder(date, slot.label)
                  if (latestTheoryMoment !== undefined && candidateMoment <= latestTheoryMoment) continue
                }

                commitRepairedCandidate(task, {
                  assignment: {
                    maLop: task.maLop,
                    maMon: task.maMon,
                    maGV,
                    maPhong: room.MaPhong,
                    ngayDay: date,
                    soTietDay: task.soTietDay,
                    hocKyDay: task.hocKyDay,
                    buoi: slot.label,
                    tuan: `Tuần ${getWeekOfYear(date)}`,
                  },
                  weekIndex,
                  staticScore: -Math.abs(weekIndex - task.targetWeekIndex),
                  weekDistance: Math.abs(weekIndex - task.targetWeekIndex),
                  teacherKeys,
                  classKeys,
                  roomKeys,
                })

                committed = true
                break
              }
              if (committed) break
            }
            if (committed) break
          }
          if (committed) break
        }
        if (committed) break
      }
    }

    const remainingAfterStrictRepair = tasksSorted.filter((task) => !assignedTaskIds.has(task.taskId))
    if (remainingAfterStrictRepair.length > 0) {
      const unresolvedDetails = remainingAfterStrictRepair.map((task) => {
        const taskIndex = tasksSorted.findIndex((item) => item.taskId === task.taskId)
        const candidates = taskIndex >= 0 ? (candidateByTask[taskIndex] || []) : []
        const className = String(classById.get(Number(task.maLop))?.TenLop || `Lớp ${task.maLop}`)

        if (candidates.length === 0) {
          const eligibleTeachers = (expertiseByCourse.get(task.maMon) || [])
            .filter((maGV) => instructors.some((gv) => gv.MaGV === maGV))
          const reason = eligibleTeachers.length === 0
            ? "Không có giảng viên đúng chuyên môn"
            : "Không sinh được candidate hợp lệ"
          return `${className} | ${task.courseName} | chunk ${task.chunkIndex}: ${reason}`
        }

        let conflictBlocked = 0
        let practiceOrderBlocked = 0
        let roomConstraintBlocked = 0

        for (const candidate of candidates) {
          const hasTeacherConflict = candidate.teacherKeys.some((key) => teacherBusyFinal.has(key))
          const hasClassConflict = candidate.classKeys.some((key) => classBusyFinal.has(key))
          const hasRoomConflict = candidate.roomKeys.some((key) => roomBusyFinal.has(key))
          if (hasTeacherConflict || hasClassConflict || hasRoomConflict) {
            conflictBlocked += 1
            continue
          }

          const classInfo = classById.get(Number(task.maLop))
          const classSize = Number(classInfo?.SiSo || 0)
          const roomInfo = roomById.get(Number(candidate.assignment.maPhong))
          const roomCapacity = Number(roomInfo?.SucChua || 0)
          if ((enforceRoomOptimization && classSize > 0 && roomCapacity > 0 && roomCapacity < classSize) ||
              (task.isPractice && !roomMatchesPreferredType(roomInfo?.LoaiPhong, task.preferredRoomType))) {
            roomConstraintBlocked += 1
            continue
          }

          if (task.isPractice && pairKeysWithBothTheoryAndPractice.has(getTheoryPracticePairKey(task))) {
            const pairKey = getTheoryPracticePairKey(task)
            const latestTheoryMoment = latestTheoryMomentByKeyFinal.get(pairKey)
            const candidateMoment = getAssignmentMomentOrder(candidate.assignment.ngayDay, candidate.assignment.buoi)
            if (latestTheoryMoment !== undefined && candidateMoment <= latestTheoryMoment) {
              practiceOrderBlocked += 1
              continue
            }
          }
        }

        let reason = "Không còn ô trống hợp lệ theo ràng buộc cứng"
        if (conflictBlocked === candidates.length) {
          reason = "Mọi candidate đều trùng giảng viên/lớp/phòng"
        } else if (practiceOrderBlocked > 0 && practiceOrderBlocked + conflictBlocked >= candidates.length) {
          reason = "Bị chặn bởi thứ tự Lý thuyết trước Thực hành"
        } else if (roomConstraintBlocked > 0 && roomConstraintBlocked + conflictBlocked >= candidates.length) {
          reason = "Bị chặn bởi ràng buộc phòng học (loại phòng/sức chứa)"
        }

        return `${className} | ${task.courseName} | chunk ${task.chunkIndex}: ${reason}`
      })

      warnings.push(
        `Không thể xếp đủ lịch theo chế độ không xung đột (còn ${remainingAfterStrictRepair.length} tác vụ chưa xếp). ` +
        `Chuyển sang chế độ fallback để xếp với mức xung đột tối thiểu. ` +
        `Chi tiết: ${unresolvedDetails.slice(0, 20).join("; ")}${unresolvedDetails.length > 20 ? "; ..." : ""}.`,
      )
    }

    // Pass 4: Coverage fallback â€” if there are still unassigned tasks, place them with the
    // minimum achievable number of hard conflicts while preserving other core constraints.
    const stillMissingAfterCompletion = tasksSorted.filter((task) => !assignedTaskIds.has(task.taskId))
    for (const task of stillMissingAfterCompletion) {
      if (assignedTaskIds.has(task.taskId)) continue

      const taskIndex = tasksSorted.indexOf(task)
      const candidates = candidateByTask[taskIndex] || []
      let bestForcedCandidate: Candidate | null = null
      let bestForcedScore = Number.NEGATIVE_INFINITY
      let bestForcedConflictCount = Number.POSITIVE_INFINITY

      for (const candidate of candidates) {
        const dateKey = candidate.assignment.ngayDay.toISOString().slice(0, 10)
        const classSubjectDayKey = `${task.maLop}_${task.maMon}_${dateKey}`
        const hasTeacherConflict = candidate.teacherKeys.some((key) => teacherBusyFinal.has(key))
        const hasClassConflict = candidate.classKeys.some((key) => classBusyFinal.has(key))
        const hasRoomConflict = candidate.roomKeys.some((key) => roomBusyFinal.has(key))
        const sameSubjectSameDay = classSubjectDayBusyFinal.has(classSubjectDayKey)
        const conflictCount = Number(hasTeacherConflict) + Number(hasClassConflict) + Number(hasRoomConflict) + Number(sameSubjectSameDay)

        const classInfo = classById.get(Number(task.maLop))
        const classSize = Number(classInfo?.SiSo || 0)
        const roomInfo = roomById.get(Number(candidate.assignment.maPhong))
        const roomCapacity = Number(roomInfo?.SucChua || 0)
        if (enforceRoomOptimization && classSize > 0 && roomCapacity > 0 && roomCapacity < classSize) continue
        if (task.isPractice && !roomMatchesPreferredType(roomInfo?.LoaiPhong, task.preferredRoomType)) continue

        const lastCourseWeek = lastWeekByCourseRunFinal.get(task.courseRunKey)
        if (lastCourseWeek !== undefined && candidate.weekIndex < lastCourseWeek) continue

        if (task.isPractice && pairKeysWithBothTheoryAndPractice.has(getTheoryPracticePairKey(task))) {
          const pairKey = getTheoryPracticePairKey(task)
          const latestTheoryMoment = latestTheoryMomentByKeyFinal.get(pairKey)
          const candidateMoment = getAssignmentMomentOrder(candidate.assignment.ngayDay, candidate.assignment.buoi)
          if (latestTheoryMoment !== undefined && candidateMoment <= latestTheoryMoment) continue
        }

        const score = candidate.staticScore - conflictCount * 40 - candidate.weekDistance * 1.5
        if (
          conflictCount < bestForcedConflictCount ||
          (conflictCount === bestForcedConflictCount && score > bestForcedScore)
        ) {
          bestForcedConflictCount = conflictCount
          bestForcedScore = score
          bestForcedCandidate = candidate
        }
      }

      if (bestForcedCandidate) {
        commitForcedConflictCandidate(task, bestForcedCandidate, bestForcedConflictCount)
      }
    }

    // Pass 5: Emergency from-scratch coverage â€” only for still-missing tasks.
    // This bypasses the pre-generated candidate pool and searches directly for the
    // least-bad feasible placement to eliminate remaining schedule gaps.
    const emergencyMissingTasks = tasksSorted.filter((task) => !assignedTaskIds.has(task.taskId))
    for (const task of emergencyMissingTasks) {
      if (assignedTaskIds.has(task.taskId)) continue

      const semester = semesterById.get(task.maHK)
      if (!semester) continue

      const semesterWindow = semesterWindowById.get(semester.MaHK) || buildEffectiveSemesterWindow(semester, semesterCountByYear)
      const weekStarts = buildWeekStarts(semesterWindow.start, semesterWindow.end)
      if (weekStarts.length === 0) continue

      const eligibleTeachers = (expertiseByCourse.get(task.maMon) || [])
        .filter((maGV) => instructors.some((gv) => gv.MaGV === maGV))
      const teacherCandidates = Array.from(new Set(eligibleTeachers))
      const teacherPool = rotatePool(teacherCandidates, Math.min(18, teacherCandidates.length), task.maLop + task.maMon + task.chunkIndex)
      if (teacherPool.length === 0) continue

      const matchingRooms = (enforceRoomOptimization || task.isPractice)
        ? rooms.filter((room) => roomMatchesPreferredType(room.LoaiPhong, task.preferredRoomType))
        : rooms
      const emergencyRoomsSource = matchingRooms.length > 0 ? matchingRooms : rooms
      const roomPool = rotatePool(emergencyRoomsSource, Math.min(task.isPractice ? 90 : 120, emergencyRoomsSource.length), task.maLop + task.maMon + task.chunkIndex)
      if (roomPool.length === 0) continue

      const weekOrder = buildWeekPreferenceOrder(weekStarts.length, task.targetWeekIndex)
      const dayOrder = [1, 2, 3, 4, 5, 6, 7]
      let bestEmergencyCandidate: Candidate | null = null
      let bestEmergencyScore = Number.NEGATIVE_INFINITY
      let bestEmergencyConflictCount = Number.POSITIVE_INFINITY

      for (const weekIndex of weekOrder) {
        for (const day of dayOrder) {
          for (const slot of SLOT_OPTIONS) {
            const slotPeriods = resolveSlotPeriods(slot.label)
            if (slotPeriods.length < task.soTietDay) continue

            const date = new Date(weekStarts[weekIndex])
            date.setDate(date.getDate() + (day - 1))
            date.setHours(12, 0, 0, 0)

            const lastCourseWeek = lastWeekByCourseRunFinal.get(task.courseRunKey)
            if (lastCourseWeek !== undefined && weekIndex < lastCourseWeek) continue

            for (const maGV of teacherPool) {
              for (const room of roomPool) {
                const dateKey = date.toISOString().slice(0, 10)
                const classSubjectDayKey = `${task.maLop}_${task.maMon}_${dateKey}`
                const teacherKeys = slotPeriods.map((period) => `${maGV}_${weekIndex}_${day}_${period}`)
                const classKeys = slotPeriods.map((period) => `${task.maLop}_${weekIndex}_${day}_${period}`)
                const roomKeys = slotPeriods.map((period) => `${room.MaPhong}_${weekIndex}_${day}_${period}`)

                const hasTeacherConflict = teacherKeys.some((key) => teacherBusyFinal.has(key))
                const hasClassConflict = classKeys.some((key) => classBusyFinal.has(key))
                const hasRoomConflict = roomKeys.some((key) => roomBusyFinal.has(key))
                const sameSubjectSameDay = classSubjectDayBusyFinal.has(classSubjectDayKey)
                const conflictCount = Number(hasTeacherConflict) + Number(hasClassConflict) + Number(hasRoomConflict) + Number(sameSubjectSameDay)

                const classInfo = classById.get(Number(task.maLop))
                const classSize = Number(classInfo?.SiSo || 0)
                const roomCapacity = Number(room.SucChua || 0)
                const roomCapacityPenalty = classSize > 0 && roomCapacity > 0 && roomCapacity < classSize ? (classSize - roomCapacity) * 3 : 0
                const nonExpertPenalty = eligibleTeachers.includes(maGV) ? 0 : 18
                const nonPracticeRoomPenalty = task.isPractice && !roomMatchesPreferredType(room.LoaiPhong, task.preferredRoomType) ? 1000 : 0
                if (nonPracticeRoomPenalty > 0) continue

                if (task.isPractice && pairKeysWithBothTheoryAndPractice.has(getTheoryPracticePairKey(task))) {
                  const pairKey = getTheoryPracticePairKey(task)
                  const latestTheoryMoment = latestTheoryMomentByKeyFinal.get(pairKey)
                  const candidateMoment = getAssignmentMomentOrder(date, slot.label)
                  if (latestTheoryMoment !== undefined && candidateMoment <= latestTheoryMoment) continue
                }

                const score =
                  -conflictCount * 45 -
                  roomCapacityPenalty -
                  nonExpertPenalty -
                  Math.abs(weekIndex - task.targetWeekIndex) * 1.2

                if (
                  conflictCount < bestEmergencyConflictCount ||
                  (conflictCount === bestEmergencyConflictCount && score > bestEmergencyScore)
                ) {
                  bestEmergencyConflictCount = conflictCount
                  bestEmergencyScore = score
                  bestEmergencyCandidate = {
                    assignment: {
                      maLop: task.maLop,
                      maMon: task.maMon,
                      maGV,
                      maPhong: room.MaPhong,
                      ngayDay: date,
                      soTietDay: task.soTietDay,
                      hocKyDay: task.hocKyDay,
                      buoi: slot.label,
                      tuan: `Tuần ${getWeekOfYear(date)}`,
                    },
                    weekIndex,
                    staticScore: score,
                    weekDistance: Math.abs(weekIndex - task.targetWeekIndex),
                    teacherKeys,
                    classKeys,
                    roomKeys,
                  }
                }
              }
            }
          }
        }
      }

      if (bestEmergencyCandidate) {
        commitForcedConflictCandidate(task, bestEmergencyCandidate, bestEmergencyConflictCount)
      }
    }

    const unassignedTasks = Math.max(0, tasksSorted.length - assignments.length)

    if (forcedConflictAssignments.length > 0) {
      const totalForcedConflictPoints = forcedConflictAssignments.reduce((sum, item) => sum + item.conflictCount, 0)
      const sample = forcedConflictAssignments
        .slice(0, 8)
        .map((item) => `${item.className} - ${item.courseName} (${item.conflictCount})`)
        .join("; ")
      warnings.push(
        `Đã phải xếp ${forcedConflictAssignments.length} tác vụ với xung đột tối thiểu để tránh thiếu lịch; tổng mức xung đột ${totalForcedConflictPoints}. ${sample}${forcedConflictAssignments.length > 8 ? "; ..." : ""}`,
      )
    }

    // Final completeness validation before persisting:
    // 1) all expected courses in each class/semester must appear
    // 2) each course must satisfy its required total periods
    const expectedPeriodsByClassSemesterCourse = new Map<string, number>()
    const assignedPeriodsByClassSemesterCourse = new Map<string, number>()
    const courseNameByClassSemesterCourse = new Map<string, string>()

    for (const task of tasksSorted) {
      const key = `${task.maLop}_${task.maHK}_${task.maMon}`
      expectedPeriodsByClassSemesterCourse.set(
        key,
        (expectedPeriodsByClassSemesterCourse.get(key) || 0) + task.soTietDay,
      )
      if (!courseNameByClassSemesterCourse.has(key)) {
        courseNameByClassSemesterCourse.set(key, task.courseName)
      }

      if (assignedTaskIds.has(task.taskId)) {
        assignedPeriodsByClassSemesterCourse.set(
          key,
          (assignedPeriodsByClassSemesterCourse.get(key) || 0) + task.soTietDay,
        )
      }
    }

    const expectedCoursesByClassSemester = new Map<string, Set<number>>()
    const assignedCoursesByClassSemester = new Map<string, Set<number>>()

    for (const key of expectedPeriodsByClassSemesterCourse.keys()) {
      const [maLopRaw, maHKRaw, maMonRaw] = key.split("_")
      const classSemesterKey = `${maLopRaw}_${maHKRaw}`
      const maMon = Number(maMonRaw)

      const expectedSet = expectedCoursesByClassSemester.get(classSemesterKey) || new Set<number>()
      expectedSet.add(maMon)
      expectedCoursesByClassSemester.set(classSemesterKey, expectedSet)

      const assignedPeriods = assignedPeriodsByClassSemesterCourse.get(key) || 0
      if (assignedPeriods > 0) {
        const assignedSet = assignedCoursesByClassSemester.get(classSemesterKey) || new Set<number>()
        assignedSet.add(maMon)
        assignedCoursesByClassSemester.set(classSemesterKey, assignedSet)
      }
    }

    const missingCourseMessages: string[] = []
    for (const [classSemesterKey, expectedSet] of expectedCoursesByClassSemester.entries()) {
      const assignedSet = assignedCoursesByClassSemester.get(classSemesterKey) || new Set<number>()
      if (assignedSet.size >= expectedSet.size) continue

      const [maLopRaw, maHKRaw] = classSemesterKey.split("_")
      const maLop = Number(maLopRaw)
      const maHK = Number(maHKRaw)
      const className = String(classById.get(maLop)?.TenLop || `Lớp ${maLop}`)
      const semesterName = String(semesterById.get(maHK)?.TenHK || maHK)
      const missingCount = expectedSet.size - assignedSet.size
      missingCourseMessages.push(`${className} - HK ${semesterName}: thiếu ${missingCount} môn`)
    }

    const insufficientPeriodMessages: string[] = []
    for (const [key, requiredPeriods] of expectedPeriodsByClassSemesterCourse.entries()) {
      const assignedPeriods = assignedPeriodsByClassSemesterCourse.get(key) || 0
      if (assignedPeriods >= requiredPeriods) continue

      const [maLopRaw, maHKRaw, maMonRaw] = key.split("_")
      const maLop = Number(maLopRaw)
      const maHK = Number(maHKRaw)
      const maMon = Number(maMonRaw)
      const className = String(classById.get(maLop)?.TenLop || `Lớp ${maLop}`)
      const semesterName = String(semesterById.get(maHK)?.TenHK || maHK)
      const courseName = String(courseNameByClassSemesterCourse.get(key) || `Môn ${maMon}`)
      insufficientPeriodMessages.push(
        `${className} - HK ${semesterName} - ${courseName}: ${assignedPeriods}/${requiredPeriods} tiết`,
      )
    }

    updateStep(
      job,
      2,
      "completed",
      `Đã xếp ${assignments.length}/${tasks.length} tác vụ, chưa xếp ${unassignedTasks}`,
      84,
    )

    updateStep(job, 3, "running", "Đang kiểm tra đủ môn và đủ số tiết trước khi lưu...", 88)

    if (missingCourseMessages.length > 0 || insufficientPeriodMessages.length > 0) {
      if (missingCourseMessages.length > 0) {
        warnings.push(`Thiếu môn sau lập lịch: ${missingCourseMessages.length} trường hợp`)
      }
      if (insufficientPeriodMessages.length > 0) {
        warnings.push(`Thiếu số tiết sau lập lịch: ${insufficientPeriodMessages.length} trường hợp`)
      }

      const detailPreview = [...missingCourseMessages, ...insufficientPeriodMessages]
        .slice(0, 12)
        .join("; ")

      throw new Error(
        `Không thể xác nhận hoàn tất vì chưa đủ môn/số tiết. ${detailPreview}${
          (missingCourseMessages.length + insufficientPeriodMessages.length) > 12 ? "; ..." : ""
        }`,
      )
    }

    updateStep(job, 3, "running", "Đang ghi dữ liệu vào LICH_DAY...", 90)

    const transaction = new sql.Transaction(pool)
    await transaction.begin()

    try {
      if (payload.replaceExisting) {
        const uniqueSemesterNames = Array.from(new Set(semesters.map((item) => String(item.TenHK || "").trim()).filter(Boolean)))

        if (uniqueSemesterNames.length > 0) {
          const deleteRequest = new sql.Request(transaction)
          const placeholders = uniqueSemesterNames.map((_, i) => `@hocKy${i}`)
          uniqueSemesterNames.forEach((hocKy, index) => {
            deleteRequest.input(`hocKy${index}`, hocKy)
          })

          if (allMajorsMode) {
            await deleteRequest.query(`
              DELETE ld
              FROM LICH_DAY ld
              WHERE LTRIM(RTRIM(ISNULL(CAST(ld.HocKyDay AS NVARCHAR(50)), ''))) IN (${placeholders.join(",")})
            `)
          } else {
            deleteRequest.input("majorId", payload.majorId)
            await deleteRequest.query(`
              DELETE ld
              FROM LICH_DAY ld
              INNER JOIN LOP l ON l.MaLop = ld.MaLop
              WHERE CAST(l.MaNganh AS NVARCHAR(50)) = @majorId
                AND LTRIM(RTRIM(ISNULL(CAST(ld.HocKyDay AS NVARCHAR(50)), ''))) IN (${placeholders.join(",")})
            `)
          }
        }
      }

      const maxResult = await new sql.Request(transaction).query(`SELECT ISNULL(MAX(MaLD), 0) AS maxId FROM LICH_DAY`)
      let nextMaLD = Number(maxResult.recordset?.[0]?.maxId || 0) + 1

      for (const item of assignments) {
        await new sql.Request(transaction)
          .input("MaLD", sql.Int, nextMaLD)
          .input("MaLop", sql.Int, item.maLop)
          .input("MaPhong", sql.Int, item.maPhong)
          .input("MaGV", sql.Int, item.maGV)
          .input("MaMon", sql.Int, item.maMon)
          .input("NgayDay", sql.DateTime, item.ngayDay)
          .input("SoTietDay", sql.Int, item.soTietDay)
          .input("TrangThai", sql.NVarChar(50), "Đang diễn ra")
          .input("HocKyDay", sql.VarChar(50), item.hocKyDay)
          .input("Buoi", sql.NVarChar(50), item.buoi)
          .input("Tuan", sql.NVarChar(50), item.tuan)
          .query(`
            INSERT INTO LICH_DAY (MaLD, MaLop, MaPhong, MaGV, MaMon, NgayDay, SoTietDay, TrangThai, HocKyDay, Buoi, Tuan)
            VALUES (@MaLD, @MaLop, @MaPhong, @MaGV, @MaMon, @NgayDay, @SoTietDay, @TrangThai, @HocKyDay, @Buoi, @Tuan)
          `)

        nextMaLD += 1
      }

      await transaction.commit()
    } catch (dbError) {
      await transaction.rollback()
      throw dbError
    }

    updateStep(job, 3, "completed", "Đã lưu kết quả lập lịch", 96)
    updateStep(job, 4, "completed", "Hoàn tất lập lịch", 100)

    job.status = "completed"
    job.finishedAt = new Date().toISOString()
    job.result = {
      createdRows: assignments.length,
      unassignedTasks,
      totalTasks: tasks.length,
      warnings: warnings.map((item) => repairMojibakeText(item)),
    }
  } catch (error: any) {
    console.error("Schedule generation error:", error)
    const message = repairMojibakeText(String(error?.message || "Lỗi chưa xác định"))

    const runningIndex = job.steps.findIndex((step) => step.status === "running")
    if (runningIndex >= 0) {
      updateStep(job, runningIndex, "error", message)
    }

    job.status = "error"
    job.error = message
    job.finishedAt = new Date().toISOString()
  } finally {
    if (pool) {
      await pool.close()
    }

    setTimeout(() => {
      jobs.delete(job.id)
    }, 1000 * 60 * 30)
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const jobId = String(searchParams.get("jobId") || "").trim()
    const mode = String(searchParams.get("mode") || "").trim()

    if (jobId) {
      const job = jobs.get(jobId)
      if (!job) {
        return NextResponse.json({ success: false, error: "Không tìm thấy tiến trình lập lịch" }, { status: 404 })
      }

      return NextResponse.json({ success: true, data: sanitizeJobForResponse(job) })
    }

    const pool = await new sql.ConnectionPool(dbConfig).connect()

    if (mode === "precheck") {
      const majorId = String(searchParams.get("majorId") || "").trim()
      const semesterIds = searchParams.getAll("semesterId").map((item) => String(item || "").trim()).filter(Boolean)

      if (!majorId) {
        await pool.close()
        return NextResponse.json({ success: false, error: "Thiếu ngành để kiểm tra trước khi lập lịch" }, { status: 400 })
      }

      const majorResult = await pool.request().input("majorId", majorId).query(`
        SELECT TOP 1 TenNganh
        FROM NGANH
        WHERE CAST(MaNganh AS NVARCHAR(50)) = @majorId
      `)

      let existingScheduleCount = 0

      if (semesterIds.length > 0) {
        const requestDb = pool.request().input("majorId", majorId)
        semesterIds.forEach((id, index) => {
          requestDb.input(`semesterId${index}`, id)
        })

        const result = await requestDb.query(`
          SELECT COUNT(1) AS existingScheduleCount
          FROM LICH_DAY ld
          INNER JOIN LOP l ON l.MaLop = ld.MaLop
          WHERE CAST(l.MaNganh AS NVARCHAR(50)) = @majorId
            AND LTRIM(RTRIM(ISNULL(CAST(ld.HocKyDay AS NVARCHAR(50)), ''))) IN (
              SELECT LTRIM(RTRIM(ISNULL(CAST(hk.TenHK AS NVARCHAR(50)), '')))
              FROM HOC_KY hk
              WHERE CAST(hk.MaHK AS NVARCHAR(50)) IN (${semesterIds.map((_, i) => `@semesterId${i}`).join(",")})
            )
        `)

        existingScheduleCount = Number(result.recordset?.[0]?.existingScheduleCount || 0)
      } else {
        const result = await pool.request().input("majorId", majorId).query(`
          SELECT COUNT(1) AS existingScheduleCount
          FROM LICH_DAY ld
          INNER JOIN LOP l ON l.MaLop = ld.MaLop
          WHERE CAST(l.MaNganh AS NVARCHAR(50)) = @majorId
        `)

        existingScheduleCount = Number(result.recordset?.[0]?.existingScheduleCount || 0)
      }

      const majorName = String(majorResult.recordset?.[0]?.TenNganh || "").trim()

      await pool.close()
      return NextResponse.json({
        success: true,
        data: {
          majorName,
          hasExistingSchedule: existingScheduleCount > 0,
          existingScheduleCount,
        },
      })
    }

    const majorResult = await pool.request().query(`
      SELECT n.MaNganh, n.TenNganh, k.TenKhoa
      FROM NGANH n
      LEFT JOIN KHOA k ON k.MaKhoa = n.MaKhoa
      ORDER BY k.TenKhoa, n.TenNganh
    `)

    const semesterColumns = await getTableColumns(pool, "HOC_KY")
    const hasMajorIdColumn = semesterColumns.has("manganhhk")
    const hasMajorNameColumn = semesterColumns.has("tennganhhk")

    const semesterResult = await pool.request().query(`
      SELECT
        hk.MaHK,
        hk.TenHK,
        hk.NamHK,
        ${hasMajorIdColumn ? "CAST(hk.MaNganhHK AS NVARCHAR(50))" : "''"} AS MaNganhHK,
        ${hasMajorNameColumn ? "CAST(hk.TenNganhHK AS NVARCHAR(255))" : "''"} AS TenNganhHK,
        n.TenNganh AS JoinedMajorName,
        hk.TuNgay,
        hk.DenNgay,
        hk.TrangThai
      FROM HOC_KY hk
      LEFT JOIN NGANH n ON ${hasMajorIdColumn ? "CAST(n.MaNganh AS NVARCHAR(50)) = CAST(hk.MaNganhHK AS NVARCHAR(50))" : "1 = 0"}
      WHERE ${ONGOING_STATUS_SQL}
      ORDER BY TRY_CONVERT(INT, hk.NamHK) ASC, TRY_CONVERT(INT, hk.TenHK) ASC, hk.MaHK ASC
    `)

    await pool.close()

    const majors = (majorResult.recordset || []).map((row: any) => ({
      id: String(row.MaNganh || "").trim(),
      name: String(row.TenNganh || "").trim(),
      departmentName: String(row.TenKhoa || "").trim(),
    }))

    const majorNameToId = new Map<string, string>()
    for (const item of majors) {
      majorNameToId.set(normalizeVietnameseText(String(item.name || "")), String(item.id || "").trim())
    }

    const semesters = (semesterResult.recordset || [])
      .map((row: any) => {
        const classYear = Number(row.NamHK || 0)
        if (!Number.isFinite(classYear) || classYear < 1 || classYear > 4) return null

        const majorIdFromSemester = String(row.MaNganhHK || "").trim()
        const majorNameFromSemester = String(row.TenNganhHK || row.JoinedMajorName || "").trim()
        const normalizedMajorName = normalizeVietnameseText(majorNameFromSemester)
        const majorId = majorIdFromSemester || majorNameToId.get(normalizedMajorName) || ""

        return {
          id: String(row.MaHK || "").trim(),
          name: String(row.TenHK || "").trim(),
          classYear,
          majorId,
          majorName: majorNameFromSemester,
          startDate: row.TuNgay,
          endDate: row.DenNgay,
          status: String(row.TrangThai || "").trim(),
        }
      })
      .filter((item: any) => item && (item.majorId || item.majorName))

    return NextResponse.json({ success: true, data: { majors, semesters } })
  } catch (error) {
    console.error("Error fetching generation options/status:", error)
    return NextResponse.json({ success: false, error: "Lỗi khi tải dữ liệu lập lịch" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const majorId = String(body.majorId || "").trim()
    const semesterIds = Array.isArray(body.semesterIds)
      ? body.semesterIds.map((item: unknown) => String(item || "").trim()).filter(Boolean)
      : []

    const settings = {
      avoidConflicts: Boolean(body?.settings?.avoidConflicts ?? true),
      optimizeRooms: Boolean(body?.settings?.optimizeRooms ?? true),
      balanceWorkload: Boolean(body?.settings?.balanceWorkload ?? true),
      respectPreferences: Boolean(body?.settings?.respectPreferences ?? true),
    }

    const replaceExisting = Boolean(body.replaceExisting ?? true)

    if (!majorId) {
      return NextResponse.json({ success: false, error: "Vui lòng chọn ngành để lập lịch" }, { status: 400 })
    }

    const jobId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const job: JobState = {
      id: jobId,
      status: "running",
      progress: 0,
      steps: buildDefaultSteps(),
      startedAt: new Date().toISOString(),
    }

    jobs.set(jobId, job)

    const payload: GenerationPayload = {
      majorId,
      semesterIds,
      settings,
      replaceExisting,
    }

    runGeneration(job, payload)

    return NextResponse.json({ success: true, data: { jobId } }, { status: 202 })
  } catch (error) {
    console.error("Error creating schedule generation job:", error)
    return NextResponse.json({ success: false, error: "Lỗi khi khởi tạo tác vụ lập lịch" }, { status: 500 })
  }
}


