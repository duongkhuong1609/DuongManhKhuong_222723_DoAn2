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

const MIN_COURSES_PER_INSTRUCTOR = 3

const toText = (v) => String(v == null ? '' : v).trim()

const byCountThenId = (a, b) => {
  if (a.expertCount !== b.expertCount) return a.expertCount - b.expertCount
  return a.maMon - b.maMon
}

;(async () => {
  const pool = await new sql.ConnectionPool(cfg).connect()

  try {
    const [majorRows, courseRows, instructorRows, expertiseRows] = await Promise.all([
      pool.request().query(`
        SELECT CAST(n.MaNganh AS NVARCHAR(50)) AS MaNganh, CAST(n.MaKhoa AS NVARCHAR(50)) AS MaKhoa
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
        SELECT cm.MaGV, cm.MaMon
        FROM CHUYEN_MON_CUA_GV cm
      `),
    ])

    const majors = majorRows.recordset || []
    const courses = courseRows.recordset || []
    const instructors = instructorRows.recordset || []
    const allExpertise = expertiseRows.recordset || []

    const majorById = new Map()
    for (const row of majors) {
      majorById.set(toText(row.MaNganh), { maKhoa: toText(row.MaKhoa) })
    }

    const instructorById = new Map()
    for (const row of instructors) {
      instructorById.set(Number(row.MaGV), {
        maGV: Number(row.MaGV),
        tenGV: toText(row.TenGV),
        maKhoa: toText(row.MaKhoa),
      })
    }

    const activeInstructorSet = new Set(Array.from(instructorById.keys()))

    const courseById = new Map()
    for (const row of courses) {
      const maMon = Number(row.MaMon)
      const maNganh = toText(row.MaNganh)
      courseById.set(maMon, {
        maMon,
        tenMon: toText(row.TenMon),
        maNganh,
        maKhoa: majorById.get(maNganh)?.maKhoa || '',
      })
    }

    const coursesByInstructor = new Map()
    const expertsByCourse = new Map()

    for (const row of allExpertise) {
      const maGV = Number(row.MaGV)
      const maMon = Number(row.MaMon)
      if (!activeInstructorSet.has(maGV)) continue
      if (!courseById.has(maMon)) continue

      if (!coursesByInstructor.has(maGV)) coursesByInstructor.set(maGV, new Set())
      coursesByInstructor.get(maGV).add(maMon)

      if (!expertsByCourse.has(maMon)) expertsByCourse.set(maMon, new Set())
      expertsByCourse.get(maMon).add(maGV)
    }

    for (const maGV of activeInstructorSet) {
      if (!coursesByInstructor.has(maGV)) coursesByInstructor.set(maGV, new Set())
    }

    for (const maMon of courseById.keys()) {
      if (!expertsByCourse.has(maMon)) expertsByCourse.set(maMon, new Set())
    }

    const instructorsBelowBefore = Array.from(instructorById.values())
      .map((inst) => {
        const count = (coursesByInstructor.get(inst.maGV) || new Set()).size
        return { ...inst, courseCount: count }
      })
      .filter((inst) => inst.courseCount < MIN_COURSES_PER_INSTRUCTOR)
      .sort((a, b) => (a.courseCount - b.courseCount) || (a.maGV - b.maGV))

    const insertedPairs = []

    const getCandidateCourses = (inst) => {
      const current = coursesByInstructor.get(inst.maGV) || new Set()

      const withLoad = Array.from(courseById.values())
        .filter((course) => !current.has(course.maMon))
        .map((course) => ({
          ...course,
          expertCount: (expertsByCourse.get(course.maMon) || new Set()).size,
        }))

      const sameDept = withLoad
        .filter((course) => inst.maKhoa && course.maKhoa && inst.maKhoa === course.maKhoa)
        .sort(byCountThenId)

      const crossDept = withLoad
        .filter((course) => !(inst.maKhoa && course.maKhoa && inst.maKhoa === course.maKhoa))
        .sort(byCountThenId)

      return [...sameDept, ...crossDept]
    }

    for (const inst of instructorsBelowBefore) {
      const currentSet = coursesByInstructor.get(inst.maGV) || new Set()
      let need = Math.max(0, MIN_COURSES_PER_INSTRUCTOR - currentSet.size)
      if (need === 0) continue

      const candidates = getCandidateCourses(inst)
      for (const course of candidates) {
        if (need <= 0) break
        if (currentSet.has(course.maMon)) continue

        currentSet.add(course.maMon)
        if (!expertsByCourse.has(course.maMon)) expertsByCourse.set(course.maMon, new Set())
        expertsByCourse.get(course.maMon).add(inst.maGV)

        insertedPairs.push({
          maGV: inst.maGV,
          tenGV: inst.tenGV,
          maMon: course.maMon,
          tenMon: course.tenMon,
          strategy: inst.maKhoa && course.maKhoa && inst.maKhoa === course.maKhoa ? 'same-dept' : 'cross-dept',
          expertCountBeforePick: course.expertCount,
        })

        need -= 1
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

    const instructorsBelowAfter = Array.from(instructorById.values())
      .map((inst) => {
        const count = (coursesByInstructor.get(inst.maGV) || new Set()).size
        return {
          ...inst,
          courseCount: count,
          courses: Array.from(coursesByInstructor.get(inst.maGV) || []).sort((a, b) => a - b),
        }
      })
      .filter((inst) => inst.courseCount < MIN_COURSES_PER_INSTRUCTOR)
      .sort((a, b) => (a.courseCount - b.courseCount) || (a.maGV - b.maGV))

    const summary = {
      generatedAt: new Date().toISOString(),
      policy: {
        minCoursesPerInstructor: MIN_COURSES_PER_INSTRUCTOR,
      },
      before: {
        activeInstructorsCount: instructorById.size,
        instructorsBelowMinCount: instructorsBelowBefore.length,
        zeroCourseCount: instructorsBelowBefore.filter((i) => i.courseCount === 0).length,
        oneCourseCount: instructorsBelowBefore.filter((i) => i.courseCount === 1).length,
        twoCourseCount: instructorsBelowBefore.filter((i) => i.courseCount === 2).length,
      },
      assignment: {
        insertedPairsCount: insertedPairs.length,
      },
      after: {
        instructorsBelowMinCount: instructorsBelowAfter.length,
        zeroCourseCount: instructorsBelowAfter.filter((i) => i.courseCount === 0).length,
        oneCourseCount: instructorsBelowAfter.filter((i) => i.courseCount === 1).length,
        twoCourseCount: instructorsBelowAfter.filter((i) => i.courseCount === 2).length,
      },
      details: {
        instructorsBelowMinBefore: instructorsBelowBefore,
        insertedPairs,
        instructorsBelowMinAfter: instructorsBelowAfter,
      },
    }

    const outPath = path.join(process.cwd(), 'tmp-instructor-min3-report.json')
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
