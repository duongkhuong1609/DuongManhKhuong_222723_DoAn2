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

const MIN_COURSES = 3
const MAX_COURSES = 4

const toText = (v) => String(v == null ? '' : v).trim()

const normalizeStatus = (value) =>
  toText(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')

const isManagedInstructorStatus = (status) => {
  const n = normalizeStatus(status)
  if (!n) return true
  if (n === 'da xoa' || n === 'deleted') return false
  if (n === 'vo hieu hoa') return false
  return true
}

const byExpertCountThenCourseId = (a, b) => {
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
      if (!isManagedInstructorStatus(row.TrangThai)) continue
      instructorById.set(maGV, {
        maGV,
        tenGV: toText(row.TenGV),
        maKhoa: toText(row.MaKhoa),
        status: toText(row.TrangThai),
      })
    }

    const coursesByInstructor = new Map()
    const expertsByCourse = new Map()

    for (const maGV of instructorById.keys()) {
      coursesByInstructor.set(maGV, new Set())
    }
    for (const maMon of courseById.keys()) {
      expertsByCourse.set(maMon, new Set())
    }

    for (const row of expertiseRows.recordset || []) {
      const maGV = Number(row.MaGV)
      const maMon = Number(row.MaMon)
      if (!instructorById.has(maGV)) continue
      if (!courseById.has(maMon)) continue

      coursesByInstructor.get(maGV).add(maMon)
      expertsByCourse.get(maMon).add(maGV)
    }

    const invalidPairs = []
    for (const [maGV, courseSet] of coursesByInstructor.entries()) {
      const inst = instructorById.get(maGV)
      const validCourseSet = new Set()
      for (const maMon of courseSet) {
        const course = courseById.get(maMon)
        if (!course) continue
        const validDept = inst.maKhoa && course.maKhoa && inst.maKhoa === course.maKhoa
        if (validDept) {
          validCourseSet.add(maMon)
        } else {
          invalidPairs.push({ maGV, maMon, reason: 'cross-department' })
          const experts = expertsByCourse.get(maMon)
          if (experts) experts.delete(maGV)
        }
      }
      coursesByInstructor.set(maGV, validCourseSet)
    }

    const removedOverflowPairs = []
    for (const [maGV, courseSet] of coursesByInstructor.entries()) {
      if (courseSet.size <= MAX_COURSES) continue

      const candidates = Array.from(courseSet)
        .map((maMon) => ({
          maMon,
          expertCount: (expertsByCourse.get(maMon) || new Set()).size,
        }))
        .sort((a, b) => {
          if (a.expertCount !== b.expertCount) return b.expertCount - a.expertCount
          return b.maMon - a.maMon
        })

      const removeCount = courseSet.size - MAX_COURSES
      for (let i = 0; i < removeCount; i += 1) {
        const pick = candidates[i]
        if (!pick) break
        courseSet.delete(pick.maMon)
        const experts = expertsByCourse.get(pick.maMon)
        if (experts) experts.delete(maGV)
        removedOverflowPairs.push({ maGV, maMon: pick.maMon, reason: 'overflow>4' })
      }
    }

    const insertedPairs = []

    const getCourseCandidatesForInstructor = (inst) => {
      const currentSet = coursesByInstructor.get(inst.maGV) || new Set()
      return Array.from(courseById.values())
        .filter((course) => !currentSet.has(course.maMon))
        .filter((course) => inst.maKhoa && course.maKhoa && inst.maKhoa === course.maKhoa)
        .map((course) => ({
          ...course,
          expertCount: (expertsByCourse.get(course.maMon) || new Set()).size,
        }))
        .sort(byExpertCountThenCourseId)
    }

    for (const inst of instructorById.values()) {
      const currentSet = coursesByInstructor.get(inst.maGV) || new Set()
      if (currentSet.size >= MIN_COURSES) continue

      let need = MIN_COURSES - currentSet.size
      const candidates = getCourseCandidatesForInstructor(inst)

      for (const course of candidates) {
        if (need <= 0) break
        if (currentSet.has(course.maMon)) continue
        if (currentSet.size >= MAX_COURSES) break

        currentSet.add(course.maMon)
        if (!expertsByCourse.has(course.maMon)) expertsByCourse.set(course.maMon, new Set())
        expertsByCourse.get(course.maMon).add(inst.maGV)

        insertedPairs.push({
          maGV: inst.maGV,
          tenGV: inst.tenGV,
          maMon: course.maMon,
          tenMon: course.tenMon,
          maNganh: course.maNganh,
          strategy: 'same-department-fill-min3',
        })

        need -= 1
      }
    }

    const pairsToDelete = [...invalidPairs, ...removedOverflowPairs]

    const tx = new sql.Transaction(pool)
    await tx.begin()
    try {
      for (const pair of pairsToDelete) {
        await new sql.Request(tx)
          .input('MaGV', sql.Int, pair.maGV)
          .input('MaMon', sql.Int, pair.maMon)
          .query(`
            DELETE FROM CHUYEN_MON_CUA_GV
            WHERE MaGV = @MaGV AND MaMon = @MaMon
          `)
      }

      for (const pair of insertedPairs) {
        await new sql.Request(tx)
          .input('MaGV', sql.Int, pair.maGV)
          .input('MaMon', sql.Int, pair.maMon)
          .query(`
            IF NOT EXISTS (
              SELECT 1 FROM CHUYEN_MON_CUA_GV WHERE MaGV = @MaGV AND MaMon = @MaMon
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

    const violationsAfter = []
    for (const inst of instructorById.values()) {
      const currentSet = coursesByInstructor.get(inst.maGV) || new Set()
      if (currentSet.size < MIN_COURSES || currentSet.size > MAX_COURSES) {
        violationsAfter.push({
          maGV: inst.maGV,
          tenGV: inst.tenGV,
          maKhoa: inst.maKhoa,
          courseCount: currentSet.size,
          courses: Array.from(currentSet).sort((a, b) => a - b),
        })
      }
    }

    const crossDeptViolationsAfter = []
    for (const [maGV, courseSet] of coursesByInstructor.entries()) {
      const inst = instructorById.get(maGV)
      for (const maMon of courseSet) {
        const course = courseById.get(maMon)
        const validDept = inst?.maKhoa && course?.maKhoa && inst.maKhoa === course.maKhoa
        if (!validDept) {
          crossDeptViolationsAfter.push({ maGV, maMon })
        }
      }
    }

    const summary = {
      generatedAt: new Date().toISOString(),
      policy: {
        minCoursesPerInstructor: MIN_COURSES,
        maxCoursesPerInstructor: MAX_COURSES,
        departmentStrictMatch: true,
      },
      totals: {
        managedInstructors: instructorById.size,
        courses: courseById.size,
      },
      actions: {
        removedInvalidDepartmentPairs: invalidPairs.length,
        removedOverflowPairs: removedOverflowPairs.length,
        insertedPairs: insertedPairs.length,
      },
      after: {
        remainingCountViolations: violationsAfter.length,
        remainingCrossDepartmentViolations: crossDeptViolationsAfter.length,
      },
      details: {
        removedInvalidDepartmentPairs: invalidPairs,
        removedOverflowPairs,
        insertedPairs,
        violationsAfter,
        crossDeptViolationsAfter,
      },
    }

    const outPath = path.join(process.cwd(), 'tmp-instructor-expertise-normalize-report.json')
    fs.writeFileSync(outPath, JSON.stringify(summary, null, 2), 'utf8')

    console.log(JSON.stringify({
      ok: true,
      outPath,
      actions: summary.actions,
      after: summary.after,
    }, null, 2))
  } finally {
    await pool.close()
  }
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
