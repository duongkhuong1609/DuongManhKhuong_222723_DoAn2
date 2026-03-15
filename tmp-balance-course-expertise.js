const fs = require('fs')
const path = require('path')
const sql = require('mssql')

const cfg = {
  server: 'localhost',
  instanceName: 'SQLEXPRESS',
  database: 'LAP_LICH_TU_DONG',
  authentication: { type: 'default', options: { userName: 'sa', password: '123456' } },
  options: { encrypt: false, trustServerCertificate: true },
}

const ACTIVE_STATUS_INCLUDE = [
  'CÓ THỂ DẠY', 'CO THE DAY',
  'ACTIVE', 'HOẠT ĐỘNG', 'HOAT DONG',
  'ĐANG DẠY', 'DANG DAY',
  '',
]

const ACTIVE_STATUS_EXCLUDE = [
  'TẠM DỪNG', 'TAM DUNG',
  'TẠM NGƯNG', 'TAM NGUNG',
  'VÔ HIỆU HÓA', 'VO HIEU HOA',
]

const MIN_EXPERTS_PER_COURSE = 2

const toText = (v) => String(v == null ? '' : v).trim()

const sortByLoadThenId = (a, b) => {
  if (a.courseCount !== b.courseCount) return a.courseCount - b.courseCount
  return a.maGV - b.maGV
}

;(async () => {
  const pool = await new sql.ConnectionPool(cfg).connect()

  try {
    const [majorRows, courseRows, instructorRows, expertiseRows] = await Promise.all([
      pool.request().query(`
        SELECT CAST(n.MaNganh AS NVARCHAR(50)) AS MaNganh, n.TenNganh, CAST(n.MaKhoa AS NVARCHAR(50)) AS MaKhoa
        FROM NGANH n
      `),
      pool.request().query(`
        SELECT m.MaMon, m.TenMon, CAST(m.MaNganh AS NVARCHAR(50)) AS MaNganh
        FROM MON m
      `),
      pool.request().query(`
        SELECT gv.MaGV, gv.TenGV, CAST(gv.MaKhoa AS NVARCHAR(50)) AS MaKhoa
        FROM GIANG_VIEN gv
        WHERE UPPER(LTRIM(RTRIM(ISNULL(gv.TrangThai, '')))) IN (
          N'CÓ THỂ DẠY', N'CO THE DAY',
          N'ACTIVE', N'HOẠT ĐỘNG', N'HOAT DONG',
          N'ĐANG DẠY', N'DANG DAY', N''
        )
          AND UPPER(LTRIM(RTRIM(ISNULL(gv.TrangThai, '')))) NOT IN (
            N'TẠM DỪNG', N'TAM DUNG',
            N'TẠM NGƯNG', N'TAM NGUNG',
            N'VÔ HIỆU HÓA', N'VO HIEU HOA'
          )
      `),
      pool.request().query(`
        SELECT MaGV, MaMon
        FROM CHUYEN_MON_CUA_GV
      `),
    ])

    const majors = majorRows.recordset || []
    const courses = courseRows.recordset || []
    const instructors = instructorRows.recordset || []
    const allExpertise = expertiseRows.recordset || []

    const majorById = new Map()
    for (const row of majors) {
      majorById.set(toText(row.MaNganh), {
        maNganh: toText(row.MaNganh),
        tenNganh: toText(row.TenNganh),
        maKhoa: toText(row.MaKhoa),
      })
    }

    const activeInstructorSet = new Set(instructors.map((r) => Number(r.MaGV)))
    const instructorById = new Map()
    for (const row of instructors) {
      instructorById.set(Number(row.MaGV), {
        maGV: Number(row.MaGV),
        tenGV: toText(row.TenGV),
        maKhoa: toText(row.MaKhoa),
      })
    }

    const courseById = new Map()
    for (const row of courses) {
      const maMon = Number(row.MaMon)
      const maNganh = toText(row.MaNganh)
      const major = majorById.get(maNganh)
      courseById.set(maMon, {
        maMon,
        tenMon: toText(row.TenMon),
        maNganh,
        tenNganh: major?.tenNganh || '',
        maKhoa: major?.maKhoa || '',
      })
    }

    const expertsByCourse = new Map()
    const coursesByInstructor = new Map()

    for (const row of allExpertise) {
      const maGV = Number(row.MaGV)
      const maMon = Number(row.MaMon)
      if (!activeInstructorSet.has(maGV)) continue
      if (!courseById.has(maMon)) continue

      if (!expertsByCourse.has(maMon)) expertsByCourse.set(maMon, new Set())
      expertsByCourse.get(maMon).add(maGV)

      if (!coursesByInstructor.has(maGV)) coursesByInstructor.set(maGV, new Set())
      coursesByInstructor.get(maGV).add(maMon)
    }

    for (const course of courseById.values()) {
      if (!expertsByCourse.has(course.maMon)) expertsByCourse.set(course.maMon, new Set())
    }

    for (const instructor of instructorById.values()) {
      if (!coursesByInstructor.has(instructor.maGV)) coursesByInstructor.set(instructor.maGV, new Set())
    }

    const coursesZeroOrOneBefore = []
    for (const course of courseById.values()) {
      const expertCount = expertsByCourse.get(course.maMon)?.size || 0
      if (expertCount <= 1) {
        coursesZeroOrOneBefore.push({
          ...course,
          expertCount,
          experts: Array.from(expertsByCourse.get(course.maMon) || []).sort((a, b) => a - b),
        })
      }
    }

    const instructorsZeroOrOneBefore = []
    for (const inst of instructorById.values()) {
      const cset = coursesByInstructor.get(inst.maGV) || new Set()
      const courseCount = cset.size
      if (courseCount <= 1) {
        instructorsZeroOrOneBefore.push({
          ...inst,
          courseCount,
          courses: Array.from(cset).sort((a, b) => a - b),
        })
      }
    }

    // Assignment phase
    const deficientCourses = [...coursesZeroOrOneBefore]
      .sort((a, b) => (a.expertCount - b.expertCount) || (a.maMon - b.maMon))

    const insertedPairs = []

    const getCandidatePools = (course) => {
      const existingExperts = expertsByCourse.get(course.maMon) || new Set()
      const allInstructors = [...instructorById.values()]

      const withLoad = allInstructors
        .filter((i) => !existingExperts.has(i.maGV))
        .map((i) => ({
          ...i,
          courseCount: (coursesByInstructor.get(i.maGV) || new Set()).size,
        }))

      const sameDeptUnderutilized = withLoad
        .filter((i) => i.maKhoa && course.maKhoa && i.maKhoa === course.maKhoa && i.courseCount <= 1)
        .sort(sortByLoadThenId)

      const crossDeptUnderutilized = withLoad
        .filter((i) => !(i.maKhoa && course.maKhoa && i.maKhoa === course.maKhoa) && i.courseCount <= 1)
        .sort(sortByLoadThenId)

      const sameDeptAny = withLoad
        .filter((i) => i.maKhoa && course.maKhoa && i.maKhoa === course.maKhoa)
        .sort(sortByLoadThenId)

      const crossDeptAny = withLoad
        .filter((i) => !(i.maKhoa && course.maKhoa && i.maKhoa === course.maKhoa))
        .sort(sortByLoadThenId)

      return [sameDeptUnderutilized, crossDeptUnderutilized, sameDeptAny, crossDeptAny]
    }

    for (const course of deficientCourses) {
      const currentExperts = expertsByCourse.get(course.maMon) || new Set()
      let required = Math.max(0, MIN_EXPERTS_PER_COURSE - currentExperts.size)
      if (required === 0) continue

      const pools = getCandidatePools(course)
      for (const poolCandidates of pools) {
        for (const candidate of poolCandidates) {
          if (required <= 0) break
          if (currentExperts.has(candidate.maGV)) continue

          currentExperts.add(candidate.maGV)
          if (!coursesByInstructor.has(candidate.maGV)) coursesByInstructor.set(candidate.maGV, new Set())
          coursesByInstructor.get(candidate.maGV).add(course.maMon)

          insertedPairs.push({
            maGV: candidate.maGV,
            tenGV: candidate.tenGV,
            maMon: course.maMon,
            tenMon: course.tenMon,
            maNganh: course.maNganh,
            tenNganh: course.tenNganh,
            strategy: candidate.maKhoa && course.maKhoa && candidate.maKhoa === course.maKhoa
              ? (candidate.courseCount <= 1 ? 'same-dept-underutilized' : 'same-dept')
              : (candidate.courseCount <= 1 ? 'cross-dept-underutilized' : 'cross-dept'),
          })

          required -= 1
        }
        if (required <= 0) break
      }
    }

    if (insertedPairs.length > 0) {
      const tx = new sql.Transaction(pool)
      await tx.begin()
      try {
        for (const pair of insertedPairs) {
          await new sql.Request(tx)
            .input('MaGV', sql.Int, pair.maGV)
            .input('MaMon', sql.Int, pair.maMon)
            .query(`
              IF NOT EXISTS (
                SELECT 1
                FROM CHUYEN_MON_CUA_GV
                WHERE MaGV = @MaGV AND MaMon = @MaMon
              )
              BEGIN
                INSERT INTO CHUYEN_MON_CUA_GV (MaGV, MaMon)
                VALUES (@MaGV, @MaMon)
              END
            `)
        }
        await tx.commit()
      } catch (e) {
        await tx.rollback()
        throw e
      }
    }

    // Build after snapshot from in-memory maps updated by assignment
    const coursesZeroOrOneAfter = []
    for (const course of courseById.values()) {
      const expertCount = expertsByCourse.get(course.maMon)?.size || 0
      if (expertCount <= 1) {
        coursesZeroOrOneAfter.push({
          ...course,
          expertCount,
          experts: Array.from(expertsByCourse.get(course.maMon) || []).sort((a, b) => a - b),
        })
      }
    }

    const instructorsZeroOrOneAfter = []
    for (const inst of instructorById.values()) {
      const cset = coursesByInstructor.get(inst.maGV) || new Set()
      const courseCount = cset.size
      if (courseCount <= 1) {
        instructorsZeroOrOneAfter.push({
          ...inst,
          courseCount,
          courses: Array.from(cset).sort((a, b) => a - b),
        })
      }
    }

    const summary = {
      generatedAt: new Date().toISOString(),
      policy: {
        minExpertsPerCourse: MIN_EXPERTS_PER_COURSE,
        activeStatusInclude: ACTIVE_STATUS_INCLUDE,
        activeStatusExclude: ACTIVE_STATUS_EXCLUDE,
      },
      totals: {
        totalCourses: courseById.size,
        totalActiveInstructors: instructorById.size,
        expertiseRowsActiveOnlyBefore: allExpertise.filter((r) => activeInstructorSet.has(Number(r.MaGV))).length,
      },
      before: {
        coursesWith0Or1ExpertsCount: coursesZeroOrOneBefore.length,
        coursesWith0ExpertsCount: coursesZeroOrOneBefore.filter((c) => c.expertCount === 0).length,
        coursesWith1ExpertCount: coursesZeroOrOneBefore.filter((c) => c.expertCount === 1).length,
        instructorsWith0Or1CoursesCount: instructorsZeroOrOneBefore.length,
        instructorsWith0CoursesCount: instructorsZeroOrOneBefore.filter((i) => i.courseCount === 0).length,
        instructorsWith1CourseCount: instructorsZeroOrOneBefore.filter((i) => i.courseCount === 1).length,
      },
      assignment: {
        insertedPairsCount: insertedPairs.length,
      },
      after: {
        coursesWith0Or1ExpertsCount: coursesZeroOrOneAfter.length,
        coursesWith0ExpertsCount: coursesZeroOrOneAfter.filter((c) => c.expertCount === 0).length,
        coursesWith1ExpertCount: coursesZeroOrOneAfter.filter((c) => c.expertCount === 1).length,
        instructorsWith0Or1CoursesCount: instructorsZeroOrOneAfter.length,
        instructorsWith0CoursesCount: instructorsZeroOrOneAfter.filter((i) => i.courseCount === 0).length,
        instructorsWith1CourseCount: instructorsZeroOrOneAfter.filter((i) => i.courseCount === 1).length,
      },
      details: {
        coursesWith0Or1ExpertsBefore: coursesZeroOrOneBefore,
        instructorsWith0Or1CoursesBefore: instructorsZeroOrOneBefore,
        insertedPairs,
        coursesWith0Or1ExpertsAfter: coursesZeroOrOneAfter,
        instructorsWith0Or1CoursesAfter: instructorsZeroOrOneAfter,
      },
    }

    const outPath = path.join(process.cwd(), 'tmp-course-expertise-balance-report.json')
    fs.writeFileSync(outPath, JSON.stringify(summary, null, 2), 'utf8')

    console.log(JSON.stringify({
      ok: true,
      outPath,
      before: summary.before,
      assignment: summary.assignment,
      after: summary.after,
    }, null, 2))
  } finally {
    await pool.close()
  }
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
