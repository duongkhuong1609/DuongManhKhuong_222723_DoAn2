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

const MIN_EXPERTS_PER_COURSE = 3
const MAX_COURSES_PER_INSTRUCTOR = 5

const toText = (v) => String(v == null ? '' : v).trim()

const normalizeStatus = (value) =>
  toText(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')

const isEligibleInstructor = (status) => {
  const n = normalizeStatus(status)
  if (n === 'vo hieu hoa') return false
  if (n === 'da xoa' || n === 'deleted') return false
  return true
}

const byLoadThenId = (a, b) => {
  if (a.courseCount !== b.courseCount) return a.courseCount - b.courseCount
  return a.maGV - b.maGV
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
        SELECT gv.MaGV, gv.TenGV, CAST(gv.MaKhoa AS NVARCHAR(50)) AS MaKhoa, gv.TrangThai
        FROM GIANG_VIEN gv
      `),
      pool.request().query(`
        SELECT cm.MaGV, cm.MaMon
        FROM CHUYEN_MON_CUA_GV cm
      `),
    ])

    const majorById = new Map()
    for (const row of majorRows.recordset || []) {
      majorById.set(toText(row.MaNganh), { maKhoa: toText(row.MaKhoa) })
    }

    const courseById = new Map()
    for (const row of courseRows.recordset || []) {
      const maMon = Number(row.MaMon)
      const maNganh = toText(row.MaNganh)
      const maKhoa = majorById.get(maNganh)?.maKhoa || ''
      courseById.set(maMon, {
        maMon,
        tenMon: toText(row.TenMon),
        maNganh,
        maKhoa,
      })
    }

    const instructorById = new Map()
    for (const row of instructorRows.recordset || []) {
      const maGV = Number(row.MaGV)
      if (!Number.isFinite(maGV) || maGV <= 0) continue
      if (!isEligibleInstructor(row.TrangThai)) continue
      instructorById.set(maGV, {
        maGV,
        tenGV: toText(row.TenGV),
        maKhoa: toText(row.MaKhoa),
      })
    }

    const courseSetByInstructor = new Map()
    const expertSetByCourse = new Map()

    for (const maGV of instructorById.keys()) {
      courseSetByInstructor.set(maGV, new Set())
    }
    for (const maMon of courseById.keys()) {
      expertSetByCourse.set(maMon, new Set())
    }

    for (const row of expertiseRows.recordset || []) {
      const maGV = Number(row.MaGV)
      const maMon = Number(row.MaMon)
      if (!instructorById.has(maGV)) continue
      const course = courseById.get(maMon)
      if (!course) continue

      // Keep only strictly valid mappings (same department as course's major)
      const inst = instructorById.get(maGV)
      const validDept = inst.maKhoa && course.maKhoa && inst.maKhoa === course.maKhoa
      if (!validDept) continue

      courseSetByInstructor.get(maGV).add(maMon)
      expertSetByCourse.get(maMon).add(maGV)
    }

    const majorSetByInstructor = new Map()
    for (const [maGV, cset] of courseSetByInstructor.entries()) {
      const mset = new Set()
      for (const maMon of cset) {
        const course = courseById.get(maMon)
        if (course?.maNganh) mset.add(course.maNganh)
      }
      majorSetByInstructor.set(maGV, mset)
    }

    const beforeDeficientCourses = []
    for (const course of courseById.values()) {
      const expertCount = (expertSetByCourse.get(course.maMon) || new Set()).size
      if (expertCount < MIN_EXPERTS_PER_COURSE) {
        beforeDeficientCourses.push({
          maMon: course.maMon,
          tenMon: course.tenMon,
          maNganh: course.maNganh,
          maKhoa: course.maKhoa,
          expertCount,
        })
      }
    }

    const insertedPairs = []
    const swappedPairs = []
    const unresolvedCourses = []

    const sortedDeficient = [...beforeDeficientCourses].sort((a, b) => {
      if (a.expertCount !== b.expertCount) return a.expertCount - b.expertCount
      return a.maMon - b.maMon
    })

    for (const course of sortedDeficient) {
      const currentExperts = expertSetByCourse.get(course.maMon) || new Set()
      let need = Math.max(0, MIN_EXPERTS_PER_COURSE - currentExperts.size)
      if (need <= 0) continue

      const sameMajorCandidates = []
      const sameDepartmentCandidates = []
      for (const inst of instructorById.values()) {
        if (currentExperts.has(inst.maGV)) continue
        if (!(inst.maKhoa && course.maKhoa && inst.maKhoa === course.maKhoa)) continue

        const existingCourses = courseSetByInstructor.get(inst.maGV) || new Set()
        if (existingCourses.size >= MAX_COURSES_PER_INSTRUCTOR) continue

        const majorSet = majorSetByInstructor.get(inst.maGV) || new Set()
        const candidate = {
          maGV: inst.maGV,
          tenGV: inst.tenGV,
          courseCount: existingCourses.size,
        }

        if (majorSet.has(course.maNganh)) {
          sameMajorCandidates.push(candidate)
        } else {
          sameDepartmentCandidates.push(candidate)
        }
      }

      sameMajorCandidates.sort(byLoadThenId)
      sameDepartmentCandidates.sort(byLoadThenId)
      const candidates = [...sameMajorCandidates, ...sameDepartmentCandidates]

      for (const pick of candidates) {
        if (need <= 0) break

        currentExperts.add(pick.maGV)
        courseSetByInstructor.get(pick.maGV).add(course.maMon)
        majorSetByInstructor.get(pick.maGV).add(course.maNganh)

        const alreadySameMajor = (majorSetByInstructor.get(pick.maGV) || new Set()).has(course.maNganh)
        insertedPairs.push({
          maGV: pick.maGV,
          tenGV: pick.tenGV,
          maMon: course.maMon,
          tenMon: course.tenMon,
          maNganh: course.maNganh,
          strategy: alreadySameMajor ? 'same-dept-same-major-under-max5' : 'same-dept-expand-major-under-max5',
        })

        need -= 1
      }

      if (need > 0) {
        unresolvedCourses.push({
          maMon: course.maMon,
          tenMon: course.tenMon,
          maNganh: course.maNganh,
          missingExperts: need,
        })
      }
    }

    // Rebalancing pass: if still deficient and all teachers hit max load,
    // swap one existing assignment from a surplus course (> min experts)
    // to a deficient course while keeping same-department constraint.
    const unresolvedAfterInsert = [...unresolvedCourses]
    unresolvedCourses.length = 0

    for (const item of unresolvedAfterInsert) {
      const course = courseById.get(item.maMon)
      if (!course) continue

      const currentExperts = expertSetByCourse.get(course.maMon) || new Set()
      let need = Math.max(0, MIN_EXPERTS_PER_COURSE - currentExperts.size)

      while (need > 0) {
        let bestSwap = null

        for (const inst of instructorById.values()) {
          if (currentExperts.has(inst.maGV)) continue
          if (!(inst.maKhoa && course.maKhoa && inst.maKhoa === course.maKhoa)) continue

          const instCourses = courseSetByInstructor.get(inst.maGV) || new Set()
          if (instCourses.size === 0) continue

          // pick a removable course that still stays >= min experts after removal
          const removable = Array.from(instCourses)
            .filter((srcCourseId) => srcCourseId !== course.maMon)
            .map((srcCourseId) => ({
              srcCourseId,
              srcExpertCount: (expertSetByCourse.get(srcCourseId) || new Set()).size,
            }))
            .filter((x) => x.srcExpertCount > MIN_EXPERTS_PER_COURSE)
            .sort((a, b) => (b.srcExpertCount - a.srcExpertCount) || (a.srcCourseId - b.srcCourseId))

          if (removable.length === 0) continue

          const candidate = removable[0]
          const score = candidate.srcExpertCount
          if (!bestSwap || score > bestSwap.score) {
            bestSwap = {
              maGV: inst.maGV,
              tenGV: inst.tenGV,
              fromMaMon: candidate.srcCourseId,
              toMaMon: course.maMon,
              score,
            }
          }
        }

        if (!bestSwap) break

        const teacherCourses = courseSetByInstructor.get(bestSwap.maGV) || new Set()
        const fromExpertSet = expertSetByCourse.get(bestSwap.fromMaMon) || new Set()
        const toExpertSet = expertSetByCourse.get(bestSwap.toMaMon) || new Set()

        teacherCourses.delete(bestSwap.fromMaMon)
        teacherCourses.add(bestSwap.toMaMon)
        fromExpertSet.delete(bestSwap.maGV)
        toExpertSet.add(bestSwap.maGV)

        const toCourse = courseById.get(bestSwap.toMaMon)
        const majorSet = majorSetByInstructor.get(bestSwap.maGV) || new Set()
        if (toCourse?.maNganh) majorSet.add(toCourse.maNganh)

        swappedPairs.push({
          maGV: bestSwap.maGV,
          tenGV: bestSwap.tenGV,
          fromMaMon: bestSwap.fromMaMon,
          fromTenMon: courseById.get(bestSwap.fromMaMon)?.tenMon || '',
          toMaMon: bestSwap.toMaMon,
          toTenMon: courseById.get(bestSwap.toMaMon)?.tenMon || '',
          strategy: 'swap-from-surplus-course',
        })

        need -= 1
      }

      if (need > 0) {
        unresolvedCourses.push({
          maMon: course.maMon,
          tenMon: course.tenMon,
          maNganh: course.maNganh,
          missingExperts: need,
        })
      }
    }

    if (insertedPairs.length > 0 || swappedPairs.length > 0) {
      const tx = new sql.Transaction(pool)
      await tx.begin()
      try {
        for (const pair of swappedPairs) {
          await new sql.Request(tx)
            .input('MaGV', sql.Int, pair.maGV)
            .input('FromMaMon', sql.Int, pair.fromMaMon)
            .query(`
              DELETE FROM CHUYEN_MON_CUA_GV
              WHERE MaGV = @MaGV AND MaMon = @FromMaMon
            `)
        }

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

          for (const pair of swappedPairs) {
            await new sql.Request(tx)
              .input('MaGV', sql.Int, pair.maGV)
              .input('ToMaMon', sql.Int, pair.toMaMon)
              .query(`
                IF NOT EXISTS (
                  SELECT 1
                  FROM CHUYEN_MON_CUA_GV
                  WHERE MaGV = @MaGV AND MaMon = @ToMaMon
                )
                BEGIN
                  INSERT INTO CHUYEN_MON_CUA_GV (MaGV, MaMon)
                  VALUES (@MaGV, @ToMaMon)
                END
              `)
          }

        await tx.commit()
      } catch (e) {
        await tx.rollback()
        throw e
      }
    }

    const afterDeficientCourses = []
    for (const course of courseById.values()) {
      const expertCount = (expertSetByCourse.get(course.maMon) || new Set()).size
      if (expertCount < MIN_EXPERTS_PER_COURSE) {
        afterDeficientCourses.push({
          maMon: course.maMon,
          tenMon: course.tenMon,
          maNganh: course.maNganh,
          expertCount,
        })
      }
    }

    const overloadInstructorsAfter = []
    for (const inst of instructorById.values()) {
      const c = (courseSetByInstructor.get(inst.maGV) || new Set()).size
      if (c > MAX_COURSES_PER_INSTRUCTOR) {
        overloadInstructorsAfter.push({ maGV: inst.maGV, tenGV: inst.tenGV, courseCount: c })
      }
    }

    const report = {
      generatedAt: new Date().toISOString(),
      policy: {
        minExpertsPerCourse: MIN_EXPERTS_PER_COURSE,
        maxCoursesPerInstructor: MAX_COURSES_PER_INSTRUCTOR,
        strictSameDepartment: true,
        prioritizeExistingSameMajor: true,
      },
      totals: {
        activeInstructors: instructorById.size,
        totalCourses: courseById.size,
      },
      before: {
        deficientCoursesCount: beforeDeficientCourses.length,
      },
      assignment: {
        insertedPairsCount: insertedPairs.length,
        swappedPairsCount: swappedPairs.length,
      },
      after: {
        deficientCoursesCount: afterDeficientCourses.length,
        overloadInstructorsCount: overloadInstructorsAfter.length,
        unresolvedCoursesCount: unresolvedCourses.length,
      },
      details: {
        deficientCoursesBefore: beforeDeficientCourses,
        insertedPairs,
        swappedPairs,
        deficientCoursesAfter: afterDeficientCourses,
        unresolvedCourses,
        overloadInstructorsAfter,
      },
    }

    const outPath = path.join(process.cwd(), 'tmp-course-min3-max5-report.json')
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8')

    console.log(JSON.stringify({
      ok: true,
      outPath,
      before: report.before,
      assignment: report.assignment,
      after: report.after,
    }, null, 2))
  } finally {
    await pool.close()
  }
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
