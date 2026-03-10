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

type GlobalWithJobs = typeof globalThis & {
  __scheduleGenerationJobs?: Map<string, JobState>
}

const globalJobs = (globalThis as GlobalWithJobs)
if (!globalJobs.__scheduleGenerationJobs) {
  globalJobs.__scheduleGenerationJobs = new Map<string, JobState>()
}
const jobs = globalJobs.__scheduleGenerationJobs

const buildDefaultSteps = (): JobStep[] => [
  { name: "Tải dữ liệu học kỳ, lớp, môn, giảng viên", status: "pending" },
  { name: "Phân tích tác vụ và kiểm tra ràng buộc", status: "pending" },
  { name: "Sinh lịch và tối ưu phân công", status: "pending" },
  { name: "Ghi kết quả vào bảng LICH_DAY", status: "pending" },
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
}

type CourseRow = {
  MaHK: number
  MaMon: number
  TenMon: string
  SoTiet: number | null
}

type ClassRow = {
  MaLop: number
  TenLop: string
  Nam: number | null
}

type InstructorRow = {
  MaGV: number
  TenGV: string
}

type RoomRow = {
  MaPhong: number
  TenPhong: string
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

    const majorResult = await pool.request().input("majorId", payload.majorId).query(`
      SELECT TOP 1 MaNganh, TenNganh
      FROM NGANH
      WHERE CAST(MaNganh AS NVARCHAR(50)) = @majorId
    `)

    if (!majorResult.recordset.length) {
      throw new Error("Không tìm thấy ngành đã chọn")
    }

    const major = majorResult.recordset[0]
    const majorName = String(major.TenNganh || "").trim()

    const semesterRequest = pool
      .request()
      .input("majorName", majorName)

    const semesterFilterByIds = payload.semesterIds.length > 0
      ? `AND CAST(hk.MaHK AS NVARCHAR(50)) IN (${payload.semesterIds.map((_, i) => `@semesterId${i}`).join(",")})`
      : ""

    payload.semesterIds.forEach((id, index) => {
      semesterRequest.input(`semesterId${index}`, String(id))
    })

    const semesterResult = await semesterRequest.query(`
      SELECT hk.MaHK, hk.TenHK, hk.NamHK, hk.TuNgay, hk.DenNgay
      FROM HOC_KY hk
      WHERE LTRIM(RTRIM(ISNULL(hk.TenNganhHK, ''))) = @majorName
      ${semesterFilterByIds}
      ORDER BY hk.TuNgay ASC, hk.MaHK ASC
    `)

    const semesters: SemesterRow[] = semesterResult.recordset || []

    if (!semesters.length) {
      throw new Error("Không tìm thấy học kỳ phù hợp với ngành đã chọn")
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
      SELECT hkm.MaHK, m.MaMon, m.TenMon, m.SoTiet
      FROM ${linkTable} hkm
      INNER JOIN MON m ON m.MaMon = hkm.MaMon
      WHERE hkm.MaHK IN (${semesterIds.join(",")})
      ORDER BY hkm.MaHK, m.MaMon
    `)

    const classResult = await pool.request().input("majorId", payload.majorId).query(`
      SELECT MaLop, TenLop, Nam
      FROM LOP
      WHERE CAST(MaNganh AS NVARCHAR(50)) = @majorId
        AND UPPER(LTRIM(RTRIM(ISNULL(TrangThai, '')))) NOT IN (N'ĐÃ TỐT NGHIỆP', N'DA TOT NGHIEP')
      ORDER BY MaLop ASC
    `)

    const instructorResult = await pool.request().query(`
      SELECT gv.MaGV, gv.TenGV
      FROM GIANG_VIEN gv
      WHERE UPPER(LTRIM(RTRIM(ISNULL(gv.TrangThai, '')))) IN (N'ACTIVE', N'HOẠT ĐỘNG', N'HOAT DONG', N'ĐANG DẠY', N'DANG DAY', N'')
      ORDER BY gv.MaGV ASC
    `)

    const expertiseResult = await pool.request().query(`
      SELECT MaGV, MaMon
      FROM CHUYEN_MON_CUA_GV
    `)

    const roomResult = await pool.request().query(`
      SELECT MaPhong, TenPhong
      FROM PHONG
      WHERE UPPER(LTRIM(RTRIM(ISNULL(TrangThai, '')))) NOT IN (N'BẢO TRÌ', N'BAO TRI', N'KHÓA', N'KHOA', N'INACTIVE')
      ORDER BY MaPhong ASC
    `)

    const prefResult = await pool.request().query(`
      SELECT MaGV, ThuTrongTuan, TietDay, MucDoUuTien
      FROM NGUYEN_VONG_THOI_GIAN
      WHERE MucDoUuTien IN (1,2,3)
    `)

    const courses: CourseRow[] = courseResult.recordset || []
    const classes: ClassRow[] = classResult.recordset || []
    const instructors: InstructorRow[] = instructorResult.recordset || []
    const rooms: RoomRow[] = roomResult.recordset || []
    const preferences: TimePreference[] = (prefResult.recordset || []).map((row: any) => ({
      maGV: Number(row.MaGV),
      thuTrongTuan: String(row.ThuTrongTuan || ""),
      tietDay: String(row.TietDay || ""),
      mucDoUuTien: Number(row.MucDoUuTien || 0),
    }))

    if (!classes.length) throw new Error("Không có lớp học để xếp lịch")
    if (!courses.length) throw new Error("Không có môn học trong học kỳ đã chọn")
    if (!instructors.length) throw new Error("Không có giảng viên hoạt động")
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
      const matchedClasses = semesterClassYear
        ? classes.filter((item) => toNumber(item.Nam, -1) === semesterClassYear)
        : classes

      const semesterCourses = coursesBySemester.get(semester.MaHK) || []

      if (!matchedClasses.length) {
        warnings.push(`Học kỳ ${semesterNumber}: không có lớp tương ứng năm học ${String(semester.NamHK || "?")}`)
      }

      for (const classRow of matchedClasses) {
        for (const course of semesterCourses) {
          const totalPeriods = Math.max(2, toNumber(course.SoTiet, 0) || 30)
          let remaining = totalPeriods
          let chunkIndex = 1

          while (remaining > 0) {
            const chunk = remaining >= 4 ? 4 : remaining >= 2 ? 2 : remaining
            tasks.push({
              taskId: `${semester.MaHK}_${classRow.MaLop}_${course.MaMon}_${chunkIndex}`,
              maLop: classRow.MaLop,
              maMon: course.MaMon,
              maHK: semester.MaHK,
              hocKyDay: semesterNumber,
              soTietDay: chunk,
            })
            remaining -= chunk
            chunkIndex += 1
          }
        }
      }
    }

    if (!tasks.length) {
      throw new Error("Không tạo được tác vụ nào để lập lịch")
    }

    updateStep(job, 1, "completed", `Đã tạo ${tasks.length} tác vụ phân lịch`, 44)

    updateStep(job, 2, "running", "Đang sinh lịch theo ràng buộc...", 50)

    const teacherBusy = new Set<string>()
    const classBusy = new Set<string>()
    const roomBusy = new Set<string>()
    const teacherLoad = new Map<number, number>()

    const assignments: Assignment[] = []
    let unassignedTasks = 0

    const tasksSorted = [...tasks].sort((a, b) => {
      const aExpert = (expertiseByCourse.get(a.maMon) || []).length
      const bExpert = (expertiseByCourse.get(b.maMon) || []).length
      return aExpert - bExpert
    })

    for (let index = 0; index < tasksSorted.length; index += 1) {
      const task = tasksSorted[index]
      const semester = semesters.find((item) => item.MaHK === task.maHK)
      if (!semester) {
        unassignedTasks += 1
        continue
      }

      const semesterStart = semester.TuNgay ? new Date(semester.TuNgay) : new Date()
      const semesterEnd = semester.DenNgay ? new Date(semester.DenNgay) : new Date(semesterStart.getTime() + 18 * 7 * 24 * 60 * 60 * 1000)
      const weekStarts = buildWeekStarts(semesterStart, semesterEnd)

      const eligibleTeachers = (expertiseByCourse.get(task.maMon) || [])
        .filter((maGV) => instructors.some((gv) => gv.MaGV === maGV))
      const teacherPool = eligibleTeachers.length > 0
        ? eligibleTeachers
        : instructors.map((gv) => gv.MaGV)

      if (eligibleTeachers.length === 0) {
        warnings.push(`Môn ${task.maMon} chưa có chuyên môn GV rõ ràng, dùng danh sách GV hoạt động`) 
      }

      const dayOrder = [1, 2, 3, 4, 5, 6, 0]
      const sessions = ["Sáng", "Chiều"]

      const candidates: Array<{ value: Assignment; score: number }> = []

      for (let weekIndex = 0; weekIndex < weekStarts.length; weekIndex += 1) {
        for (const day of dayOrder) {
          for (const session of sessions) {
            const date = new Date(weekStarts[weekIndex])
            date.setDate(date.getDate() + (day === 0 ? 6 : day - 1))

            for (const maGV of teacherPool) {
              const teacherKey = `${maGV}_${weekIndex}_${day}_${session}`
              const classKey = `${task.maLop}_${weekIndex}_${day}_${session}`

              if (payload.settings.avoidConflicts) {
                if (teacherBusy.has(teacherKey) || classBusy.has(classKey)) continue
              }

              for (const room of rooms) {
                const roomKey = `${room.MaPhong}_${weekIndex}_${day}_${session}`
                if (payload.settings.avoidConflicts && roomBusy.has(roomKey)) continue

                const prefBonus = preferenceScore(payload.settings, prefIndex, maGV, day, session)
                const loadPenalty = payload.settings.balanceWorkload
                  ? (teacherLoad.get(maGV) || 0) * 0.25
                  : 0
                const sundayPenalty = day === 0 ? 8 : 0
                const roomPenalty = payload.settings.optimizeRooms ? 0 : Math.random() * 2

                const score = prefBonus - loadPenalty - sundayPenalty - roomPenalty + Math.random()

                candidates.push({
                  value: {
                    maLop: task.maLop,
                    maMon: task.maMon,
                    maGV,
                    maPhong: room.MaPhong,
                    ngayDay: date,
                    soTietDay: task.soTietDay,
                    hocKyDay: task.hocKyDay,
                    buoi: session,
                    tuan: `Tuần ${weekIndex + 1}`,
                  },
                  score,
                })
              }
            }
          }
        }
      }

      const picked = weightedRandom<Assignment>(candidates)
      if (!picked) {
        unassignedTasks += 1
        continue
      }

      const weekDiff = Math.floor((picked.ngayDay.getTime() - weekStarts[0].getTime()) / (7 * 24 * 60 * 60 * 1000))
      const weekday = picked.ngayDay.getDay()
      const normalizedWeekday = weekday === 0 ? 0 : weekday

      teacherBusy.add(`${picked.maGV}_${weekDiff}_${normalizedWeekday}_${picked.buoi}`)
      classBusy.add(`${picked.maLop}_${weekDiff}_${normalizedWeekday}_${picked.buoi}`)
      roomBusy.add(`${picked.maPhong}_${weekDiff}_${normalizedWeekday}_${picked.buoi}`)
      teacherLoad.set(picked.maGV, (teacherLoad.get(picked.maGV) || 0) + picked.soTietDay)

      assignments.push(picked)

      if (index % 100 === 0) {
        const dynamicProgress = 50 + Math.round((index / tasksSorted.length) * 34)
        job.progress = Math.max(job.progress, dynamicProgress)
      }
    }

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
          const deleteRequest = new sql.Request(transaction).input("majorId", payload.majorId)
          const placeholders = uniqueSemesterNames.map((_, i) => `@hocKy${i}`)
          uniqueSemesterNames.forEach((hocKy, index) => {
            deleteRequest.input(`hocKy${index}`, hocKy)
          })

          await deleteRequest.query(`
            DELETE ld
            FROM LICH_DAY ld
            INNER JOIN LOP l ON l.MaLop = ld.MaLop
            WHERE CAST(l.MaNganh AS NVARCHAR(50)) = @majorId
              AND LTRIM(RTRIM(ISNULL(CAST(ld.HocKyDay AS NVARCHAR(50)), ''))) IN (${placeholders.join(",")})
          `)
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
          .input("TrangThai", sql.VarChar(50), "Đã xếp lịch")
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

    const semesterResult = await pool.request().query(`
      SELECT MaHK, TenHK, NamHK, TenNganhHK, TuNgay, DenNgay
      FROM HOC_KY
      ORDER BY TuNgay DESC, MaHK DESC
    `)

    await pool.close()

    const majors = (majorResult.recordset || []).map((row: any) => ({
      id: String(row.MaNganh || "").trim(),
      name: String(row.TenNganh || "").trim(),
      departmentName: String(row.TenKhoa || "").trim(),
    }))

    const semesters = (semesterResult.recordset || []).map((row: any) => ({
      id: String(row.MaHK || "").trim(),
      name: String(row.TenHK || "").trim(),
      classYear: String(row.NamHK || "").trim(),
      majorName: String(row.TenNganhHK || "").trim(),
      startDate: row.TuNgay,
      endDate: row.DenNgay,
    }))

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
