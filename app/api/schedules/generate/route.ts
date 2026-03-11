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
}

const ONGOING_STATUS_SQL = `(
  LTRIM(RTRIM(ISNULL(CAST(hk.TrangThai AS NVARCHAR(50)), ''))) IN (N'Đang diễn ra', N'2')
  OR UPPER(LTRIM(RTRIM(ISNULL(CAST(hk.TrangThai AS NVARCHAR(50)), '')))) IN (N'ĐANG DIỄN RA', N'DANG DIEN RA')
)`

type GlobalWithJobs = typeof globalThis & {
  __scheduleGenerationJobs?: Map<string, JobState>
}

const globalJobs = (globalThis as GlobalWithJobs)
if (!globalJobs.__scheduleGenerationJobs) {
  globalJobs.__scheduleGenerationJobs = new Map<string, JobState>()
}
const jobs = globalJobs.__scheduleGenerationJobs

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
    return { ...step, status, message: message ?? step.message }
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

const normalizeVietnameseText = (value: unknown) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
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
  return normalized.includes("thuc tap cuoi khoa")
}

const isPracticeCourse = (courseName: unknown) => {
  const normalized = normalizeVietnameseText(courseName)
  return normalized.includes("thuc hanh")
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
    .replace(/thuc hanh/g, "")
    .replace(/ly thuyet/g, "")
    .replace(/li thuyet/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

const isExcludedFromScheduleCourse = (courseName: unknown) => {
  return isThesisCourse(courseName) || isFinalInternshipCourse(courseName)
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

const buildTargetWeekIndexes = (weekCount: number, chunkCount: number, isPractice: boolean) => {
  const safeWeekCount = Math.max(1, weekCount)
  const safeChunkCount = Math.max(1, chunkCount)
  const startIndex = isPractice && safeWeekCount > 2 ? 1 : 0
  const endIndex = Math.max(startIndex, safeWeekCount - 1)
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
          SELECT MaNganh, TenNganh
          FROM NGANH
        `)
      : await pool.request().input("majorId", payload.majorId).query(`
          SELECT TOP 1 MaNganh, TenNganh
          FROM NGANH
          WHERE CAST(MaNganh AS NVARCHAR(50)) = @majorId
        `)

    if (!majorResult.recordset.length) {
      throw new Error("Không tìm thấy ngành đã chọn")
    }

    const majorNames = (majorResult.recordset || []).map((item: any) => String(item.TenNganh || "").trim()).filter(Boolean)
    const majorName = majorNames[0] || ""

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

    if (payload.semesterIds.length > 0) {
      payload.semesterIds.forEach((id, index) => {
        semesterRequest.input(`semesterId${index}`, String(id))
      })
      semesterWhereClauses.push(
        `CAST(hk.MaHK AS NVARCHAR(50)) IN (${payload.semesterIds.map((_, i) => `@semesterId${i}`).join(",")})`
      )
    } else {
      if (hasTenNganhHK && !allMajorsMode) {
        semesterRequest.input("majorName", majorName)
        semesterWhereClauses.push(`LTRIM(RTRIM(ISNULL(hk.TenNganhHK, ''))) = @majorName`)
      }

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
      WHERE (${semesterWhereClauses.join(" OR ")})
        AND ${ONGOING_STATUS_SQL}
      ORDER BY hk.TuNgay ASC, hk.MaHK ASC
    `)

    const semesters: SemesterRow[] = semesterResult.recordset || []

    if (!semesters.length) {
      throw new Error("Không tìm thấy học kỳ ở trạng thái Đang diễn ra phù hợp để lập lịch")
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

    const courseResult = await pool.request().query(`
      SELECT hkm.MaHK, m.MaMon, m.TenMon, m.SoTiet, m.LoaiMon
      FROM ${linkTable} hkm
      INNER JOIN MON m ON m.MaMon = hkm.MaMon
      WHERE hkm.MaHK IN (${semesterIds.join(",")})
      ORDER BY hkm.MaHK, m.MaMon
    `)

    const instructorResult = await pool.request().query(`
      SELECT gv.MaGV, gv.TenGV
      FROM GIANG_VIEN gv
      WHERE UPPER(LTRIM(RTRIM(ISNULL(gv.TrangThai, '')))) IN (
        N'CÓ THỂ DẠY', N'CO THE DAY',
        N'ACTIVE', N'HOẠT ĐỘNG', N'HOAT DONG', N'ĐANG DẠY', N'DANG DAY', N''
      )
        AND UPPER(LTRIM(RTRIM(ISNULL(gv.TrangThai, '')))) NOT IN (N'TẠM DỪNG', N'TAM DUNG')
      ORDER BY gv.MaGV ASC
    `)

    const expertiseResult = await pool.request().query(`
      SELECT MaGV, MaMon
      FROM CHUYEN_MON_CUA_GV
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
          const semesterStart = semester.TuNgay ? new Date(semester.TuNgay) : new Date()
          const semesterEnd = semester.DenNgay
            ? new Date(semester.DenNgay)
            : new Date(semesterStart.getTime() + 18 * 7 * 24 * 60 * 60 * 1000)
          const weekStarts = buildWeekStarts(semesterStart, semesterEnd)
          const isPractice = isPracticeCourseType(course.LoaiMon, course.TenMon)
          const targetWeeks = buildTargetWeekIndexes(weekStarts.length, chunkPlan.length, isPractice)
          const maxMeetingsPerWeek = Math.max(1, Math.ceil(chunkPlan.length / Math.max(1, weekStarts.length)))
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
      warnings.push(`Đã bỏ qua ${excludedThesisCount} môn khóa luận/đồ án tốt nghiệp khỏi tác vụ lập lịch`)
    }
    if (excludedInternshipCount > 0) {
      warnings.push(`Đã bỏ qua ${excludedInternshipCount} môn thực tập cuối khóa khỏi tác vụ lập lịch`)
    }

    updateStep(job, 1, "completed", `Đã tạo ${tasks.length} tác vụ phân lịch`, 44)

    updateStep(job, 2, "running", "Đang sinh lịch theo ràng buộc...", 50)

    const tasksSorted = [...tasks].sort((a, b) => {
      const aExpert = (expertiseByCourse.get(a.maMon) || []).length
      const bExpert = (expertiseByCourse.get(b.maMon) || []).length
      if (aExpert !== bExpert) return aExpert - bExpert
      if (a.maLop !== b.maLop) return a.maLop - b.maLop
      if (a.courseRunKey !== b.courseRunKey) return a.courseRunKey.localeCompare(b.courseRunKey)
      if (a.baseCourseKey === b.baseCourseKey && a.isPractice !== b.isPractice) {
        return a.isPractice ? 1 : -1
      }
      return a.chunkIndex - b.chunkIndex
    })

    const semesterById = new Map<number, SemesterRow>(semesters.map((item) => [item.MaHK, item]))
    const warnedMissingExpertise = new Set<number>()

    const candidateByTask: Candidate[][] = tasksSorted.map((task, taskIndex) => {
      const semester = semesterById.get(task.maHK)
      if (!semester) return []

      const semesterStart = semester.TuNgay ? new Date(semester.TuNgay) : new Date()
      const semesterEnd = semester.DenNgay
        ? new Date(semester.DenNgay)
        : new Date(semesterStart.getTime() + 18 * 7 * 24 * 60 * 60 * 1000)
      const weekStarts = buildWeekStarts(semesterStart, semesterEnd)
      const weekOrder = buildWeekPreferenceOrder(weekStarts.length, task.targetWeekIndex)

      const eligibleTeachers = (expertiseByCourse.get(task.maMon) || [])
        .filter((maGV) => instructors.some((gv) => gv.MaGV === maGV))
      const teacherPool = eligibleTeachers

      if (eligibleTeachers.length === 0 && !warnedMissingExpertise.has(task.maMon)) {
        warnings.push(`Môn ${task.maMon} không có giảng viên đúng chuyên môn trong trạng thái có thể dạy`)
        warnedMissingExpertise.add(task.maMon)
      }

      const localCandidates: Candidate[] = []
      const dayOrder = [1, 2, 3, 4, 5, 6]
      const maxCandidates = 900
      const matchingRooms = rooms.filter((room) => roomMatchesPreferredType(room.LoaiPhong, task.preferredRoomType))
      const candidateRooms = rotatePool(
        matchingRooms.length > 0 ? matchingRooms : rooms,
        task.isPractice ? 20 : 16,
        task.maLop + task.maMon + task.chunkIndex,
      )

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
              for (const room of candidateRooms) {
                const prefBonus = preferenceScore(payload.settings, prefIndex, maGV, day, slot.preferenceSession)
                const weekDistance = Math.abs(weekIndex - task.targetWeekIndex)
                const roomTypeBonus = roomMatchesPreferredType(room.LoaiPhong, task.preferredRoomType) ? 4 : -10
                const weekBias = task.isPractice ? weekIndex * 0.35 : (weekStarts.length - weekIndex) * 0.12
                const staticScore = prefBonus + roomTypeBonus + weekBias - weekDistance * 4.2 + Math.random() * 0.2

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
      return Math.floor(Math.random() * Math.min(candidates.length, 120))
    })

    const decodeChromosome = (chromosome: number[]) => {
      const teacherBusy = new Set<string>()
      const classBusy = new Set<string>()
      const roomBusy = new Set<string>()
      const classSubjectDayBusy = new Set<string>()
      const classWeekLoad = new Map<string, number>()
      const teacherWeekLoad = new Map<string, number>()
      const courseWeekCount = new Map<string, number>()
      const lastWeekByCourseRun = new Map<string, number>()
      const theoryWeekByKey = new Map<string, number>()
      const practiceWeekByKey = new Map<string, number>()

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

        const pairKey = `${task.maLop}_${task.baseCourseKey}`
        const preferStart = chromosome[i] >= 0 && chromosome[i] < candidates.length ? chromosome[i] : 0
        const searchLimit = Math.min(candidates.length, 220)

        let bestCandidate: Candidate | null = null
        let bestCandidateScore = Number.NEGATIVE_INFINITY

        for (let offset = 0; offset < searchLimit; offset += 1) {
          const index = (preferStart + offset) % candidates.length
          const candidate = candidates[index]

          const hasTeacherConflict = candidate.teacherKeys.some((key) => teacherBusy.has(key))
          const hasClassConflict = candidate.classKeys.some((key) => classBusy.has(key))
          const hasRoomConflict = candidate.roomKeys.some((key) => roomBusy.has(key))
          if (hasTeacherConflict || hasClassConflict || hasRoomConflict) {
            continue
          }

          const candidateDateKey = candidate.assignment.ngayDay.toISOString().slice(0, 10)
          const classSubjectDayKey = `${task.maLop}_${task.maMon}_${candidateDateKey}`
          if (classSubjectDayBusy.has(classSubjectDayKey)) continue

          const classInfo = classes.find((item) => Number(item.MaLop) === Number(task.maLop))
          const classSize = Number(classInfo?.SiSo || 0)
          const roomInfo = rooms.find((room) => Number(room.MaPhong) === Number(candidate.assignment.maPhong))
          const roomCapacity = Number(roomInfo?.SucChua || 0)
          if (classSize > 0 && roomCapacity > 0 && roomCapacity < classSize) continue

          const currentLoad = classWeekLoad.get(`${task.maLop}_${candidate.weekIndex}`) || 0
          if (currentLoad + task.soTietDay > 18) continue

          const teacherWeekKey = `${candidate.assignment.maGV}_${candidate.weekIndex}`
          const currentTeacherWeekLoad = teacherWeekLoad.get(teacherWeekKey) || 0
          if (currentTeacherWeekLoad + task.soTietDay > 18) continue

          const courseWeekKey = `${task.courseRunKey}_${candidate.weekIndex}`
          const currentCourseWeekCount = courseWeekCount.get(courseWeekKey) || 0
          if (currentCourseWeekCount >= task.maxMeetingsPerWeek) continue

          const lastCourseWeek = lastWeekByCourseRun.get(task.courseRunKey)
          if (lastCourseWeek !== undefined && candidate.weekIndex < lastCourseWeek) continue

          if (task.isPractice) {
            const theoryWeek = theoryWeekByKey.get(pairKey)
            if (theoryWeek === undefined || candidate.weekIndex < theoryWeek) {
              continue
            }
          }

          let candidateScore = candidate.staticScore - currentLoad * 1.15 - currentTeacherWeekLoad * 1.1
          candidateScore -= candidate.weekDistance * 2.6

          if (lastCourseWeek !== undefined) {
            const gapFromPrevious = candidate.weekIndex - lastCourseWeek
            if (gapFromPrevious <= 0) continue
            if (gapFromPrevious === 1) {
              candidateScore += 4
            } else if (gapFromPrevious === 2) {
              candidateScore += 2
            } else {
              candidateScore -= (gapFromPrevious - 2) * 1.5
            }
          }

          if (task.isPractice) {
            const theoryWeek = theoryWeekByKey.get(pairKey) || candidate.weekIndex
            candidateScore += (candidate.weekIndex - theoryWeek) * 0.8
          } else {
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
        lastWeekByCourseRun.set(task.courseRunKey, bestCandidate.weekIndex)

        if (task.isPractice) {
          const current = practiceWeekByKey.get(pairKey)
          practiceWeekByKey.set(pairKey, current === undefined ? bestCandidate.weekIndex : Math.min(current, bestCandidate.weekIndex))
        } else {
          const current = theoryWeekByKey.get(pairKey)
          theoryWeekByKey.set(pairKey, current === undefined ? bestCandidate.weekIndex : Math.min(current, bestCandidate.weekIndex))
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
        lastWeekByCourseRun,
        theoryWeekByKey,
        practiceWeekByKey,
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

        if (load > 14) penalty += (load - 14) * 8
        if (load < 2) penalty += 2
      }

      for (const [maLop, weeks] of classToWeeks.entries()) {
        const uniqueWeeks = Array.from(new Set(weeks)).sort((a, b) => a - b)
        if (!uniqueWeeks.length) continue

        const minWeek = uniqueWeeks[0]
        const maxWeek = uniqueWeeks[uniqueWeeks.length - 1]
        for (let w = minWeek; w <= maxWeek; w += 1) {
          if (!uniqueWeeks.includes(w)) penalty += 4
        }

        const loads = uniqueWeeks.map((week) => decoded.classWeekLoad.get(`${maLop}_${week}`) || 0)
        const avg = loads.reduce((sum, value) => sum + value, 0) / Math.max(1, loads.length)
        const variance = loads.reduce((sum, value) => sum + Math.pow(value - avg, 2), 0) / Math.max(1, loads.length)
        penalty += Math.sqrt(variance) * 5
      }

      for (const [, load] of decoded.teacherWeekLoad.entries()) {
        if (load > 15) penalty += (load - 15) * 9
      }

      for (const item of decoded.selected) {
        if (!item) continue
        const list = courseRunWeeks.get(item.task.courseRunKey) || []
        list.push(item.candidate.weekIndex)
        courseRunWeeks.set(item.task.courseRunKey, list)
        penalty += Math.abs(item.candidate.weekIndex - item.task.targetWeekIndex) * 3.2
      }

      for (const [courseRunKey, weeks] of courseRunWeeks.entries()) {
        const orderedWeeks = [...weeks].sort((a, b) => a - b)
        for (let i = 1; i < orderedWeeks.length; i += 1) {
          const gap = orderedWeeks[i] - orderedWeeks[i - 1]
          if (gap <= 0) {
            penalty += 20
          } else if (gap > 3) {
            penalty += (gap - 3) * 6
          }
        }

        const sampleTask = tasksSorted.find((task) => task.courseRunKey === courseRunKey)
        if (!sampleTask) continue

        for (const [weekKey, count] of decoded.courseWeekCount.entries()) {
          if (!weekKey.startsWith(`${courseRunKey}_`)) continue
          if (count > sampleTask.maxMeetingsPerWeek) {
            penalty += (count - sampleTask.maxMeetingsPerWeek) * 18
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
        chromosome[i] = Math.floor(Math.random() * Math.min(candidates.length, 120))
      }
      return chromosome
    }

    const populationSize = 28
    const generations = 36
    let population: number[][] = Array.from({ length: populationSize }, () => randomChromosome())

    for (let generation = 0; generation < generations; generation += 1) {
      const fitness = population.map((individual) => evaluateChromosome(individual))
      const ranked = population
        .map((individual, index) => ({ individual, fit: fitness[index] }))
        .sort((a, b) => b.fit - a.fit)

      const nextPopulation: number[][] = ranked.slice(0, 6).map((item) => [...item.individual])

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
    const classSubjectDayBusyFinal = new Set<string>()
    const classWeekLoadFinal = new Map<string, number>()
    const teacherWeekLoadFinal = new Map<string, number>()
    const courseWeekCountFinal = new Map<string, number>()
    const lastWeekByCourseRunFinal = new Map<string, number>()
    const theoryWeekByKeyFinal = new Map<string, number>()

    for (const item of decodedBest.selected) {
      if (!item) continue
      item.candidate.teacherKeys.forEach((key) => teacherBusyFinal.add(key))
      item.candidate.classKeys.forEach((key) => classBusyFinal.add(key))
      item.candidate.roomKeys.forEach((key) => roomBusyFinal.add(key))
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
      lastWeekByCourseRunFinal.set(
        item.task.courseRunKey,
        Math.max(lastWeekByCourseRunFinal.get(item.task.courseRunKey) ?? -1, item.candidate.weekIndex),
      )
      if (!item.task.isPractice) {
        const pairKey = `${item.task.maLop}_${item.task.baseCourseKey}`
        theoryWeekByKeyFinal.set(
          pairKey,
          Math.min(theoryWeekByKeyFinal.get(pairKey) ?? item.candidate.weekIndex, item.candidate.weekIndex),
        )
      }
    }

    const repairOrder = tasksSorted
      .map((task, index) => ({ task, index, candidateCount: candidateByTask[index]?.length || 0 }))
      .filter((item) => !assignedTaskIds.has(item.task.taskId))
      .sort((a, b) => a.candidateCount - b.candidateCount)

    for (const repairItem of repairOrder) {
      const task = repairItem.task
      if (assignedTaskIds.has(task.taskId)) continue

      const candidates = candidateByTask[repairItem.index]
      let bestRepairCandidate: Candidate | null = null
      let bestRepairScore = Number.NEGATIVE_INFINITY

      for (const candidate of candidates) {
        const dateKey = candidate.assignment.ngayDay.toISOString().slice(0, 10)
        const classSubjectDayKey = `${task.maLop}_${task.maMon}_${dateKey}`
        const classInfo = classes.find((item) => Number(item.MaLop) === Number(task.maLop))
        const classSize = Number(classInfo?.SiSo || 0)
        const roomInfo = rooms.find((room) => Number(room.MaPhong) === Number(candidate.assignment.maPhong))
        const roomCapacity = Number(roomInfo?.SucChua || 0)
        const currentClassWeekLoad = classWeekLoadFinal.get(`${task.maLop}_${candidate.weekIndex}`) || 0
        const currentTeacherWeekLoad = teacherWeekLoadFinal.get(`${candidate.assignment.maGV}_${candidate.weekIndex}`) || 0
        const currentCourseWeekCount = courseWeekCountFinal.get(`${task.courseRunKey}_${candidate.weekIndex}`) || 0
        const lastCourseWeek = lastWeekByCourseRunFinal.get(task.courseRunKey)

        if (
          candidate.teacherKeys.some((key) => teacherBusyFinal.has(key)) ||
          candidate.classKeys.some((key) => classBusyFinal.has(key)) ||
          candidate.roomKeys.some((key) => roomBusyFinal.has(key)) ||
          classSubjectDayBusyFinal.has(classSubjectDayKey) ||
          currentClassWeekLoad + task.soTietDay > 18 ||
          currentTeacherWeekLoad + task.soTietDay > 18 ||
          currentCourseWeekCount >= task.maxMeetingsPerWeek ||
          (lastCourseWeek !== undefined && candidate.weekIndex < lastCourseWeek) ||
          (classSize > 0 && roomCapacity > 0 && roomCapacity < classSize)
        ) {
          continue
        }

        if (task.isPractice) {
          const theoryWeek = theoryWeekByKeyFinal.get(`${task.maLop}_${task.baseCourseKey}`)
          if (theoryWeek === undefined || candidate.weekIndex < theoryWeek) {
            continue
          }
        }

        let repairScore = candidate.staticScore
        repairScore -= candidate.weekDistance * 2.8
        repairScore -= currentClassWeekLoad * 1.2
        repairScore -= currentTeacherWeekLoad * 1.15

        if (lastCourseWeek !== undefined) {
          const gap = candidate.weekIndex - lastCourseWeek
          if (gap === 1) repairScore += 3
          else if (gap > 3) repairScore -= (gap - 3) * 2
        }

        if (repairScore > bestRepairScore) {
          bestRepairScore = repairScore
          bestRepairCandidate = candidate
        }
      }

      if (!bestRepairCandidate) continue

      const repairDateKey = bestRepairCandidate.assignment.ngayDay.toISOString().slice(0, 10)
      assignments.push(bestRepairCandidate.assignment)
      assignedTaskIds.add(task.taskId)
      bestRepairCandidate.teacherKeys.forEach((key) => teacherBusyFinal.add(key))
      bestRepairCandidate.classKeys.forEach((key) => classBusyFinal.add(key))
      bestRepairCandidate.roomKeys.forEach((key) => roomBusyFinal.add(key))
      classSubjectDayBusyFinal.add(`${task.maLop}_${task.maMon}_${repairDateKey}`)
      classWeekLoadFinal.set(
        `${task.maLop}_${bestRepairCandidate.weekIndex}`,
        (classWeekLoadFinal.get(`${task.maLop}_${bestRepairCandidate.weekIndex}`) || 0) + task.soTietDay,
      )
      teacherWeekLoadFinal.set(
        `${bestRepairCandidate.assignment.maGV}_${bestRepairCandidate.weekIndex}`,
        (teacherWeekLoadFinal.get(`${bestRepairCandidate.assignment.maGV}_${bestRepairCandidate.weekIndex}`) || 0) + task.soTietDay,
      )
      courseWeekCountFinal.set(
        `${task.courseRunKey}_${bestRepairCandidate.weekIndex}`,
        (courseWeekCountFinal.get(`${task.courseRunKey}_${bestRepairCandidate.weekIndex}`) || 0) + 1,
      )
      lastWeekByCourseRunFinal.set(
        task.courseRunKey,
        Math.max(lastWeekByCourseRunFinal.get(task.courseRunKey) ?? -1, bestRepairCandidate.weekIndex),
      )
    }

    const unassignedTasks = Math.max(0, tasksSorted.length - assignments.length)

    updateStep(
      job,
      2,
      "completed",
      `Đã xếp ${assignments.length}/${tasks.length} tác vụ, chưa xếp ${unassignedTasks}`,
      84,
    )

    updateStep(job, 3, "running", "Đang ghi dữ liệu vào LICH_DAY...", 88)

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

    updateStep(job, 3, "completed", `Đã ghi ${assignments.length} dòng lịch vào LICH_DAY`, 96)
    updateStep(job, 4, "completed", "Hoàn tất lập lịch", 100)

    job.status = "completed"
    job.finishedAt = new Date().toISOString()
    job.result = {
      createdRows: assignments.length,
      unassignedTasks,
      totalTasks: tasks.length,
      warnings,
    }
  } catch (error: any) {
    console.error("Schedule generation error:", error)
    const message = String(error?.message || "Lỗi chưa xác định")

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

    if (jobId) {
      const job = jobs.get(jobId)
      if (!job) {
        return NextResponse.json({ success: false, error: "Không tìm thấy tiến trình lập lịch" }, { status: 404 })
      }

      return NextResponse.json({ success: true, data: job })
    }

    const pool = await new sql.ConnectionPool(dbConfig).connect()

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
