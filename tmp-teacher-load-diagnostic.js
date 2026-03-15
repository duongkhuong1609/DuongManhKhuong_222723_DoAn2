const sql = require('mssql')

const cfg = {
  server: 'localhost',
  instanceName: 'SQLEXPRESS',
  database: 'LAP_LICH_TU_DONG',
  authentication: { type: 'default', options: { userName: 'sa', password: '123456' } },
  options: { encrypt: false, trustServerCertificate: true },
}

;(async () => {
  const pool = await new sql.ConnectionPool(cfg).connect()

  const classCountByYearRes = await pool.request().query(`
    SELECT TRY_CONVERT(INT, Nam) AS Nam, COUNT(1) AS classCount
    FROM LOP
    WHERE CAST(MaNganh AS NVARCHAR(50)) = '1'
    GROUP BY TRY_CONVERT(INT, Nam)
  `)
  const classCountByYear = new Map((classCountByYearRes.recordset || []).map(r => [Number(r.Nam), Number(r.classCount)]))

  const courseRows = await pool.request().query(`
    SELECT hkm.MaHK, TRY_CONVERT(INT, hk.NamHK) AS ClassYear, m.MaMon, m.TenMon, TRY_CONVERT(INT, m.SoTiet) AS SoTiet
    FROM HOC_KY_CAC_MON_HOC hkm
    INNER JOIN HOC_KY hk ON hk.MaHK = hkm.MaHK
    INNER JOIN MON m ON m.MaMon = hkm.MaMon
    WHERE hkm.MaHK IN (31,32,33,34)
  `)

  const expertRows = await pool.request().query(`
    SELECT MaMon, MaGV
    FROM CHUYEN_MON_CUA_GV
  `)

  const expertsByCourse = new Map()
  for (const r of expertRows.recordset || []) {
    const mon = Number(r.MaMon)
    const gv = Number(r.MaGV)
    if (!expertsByCourse.has(mon)) expertsByCourse.set(mon, [])
    expertsByCourse.get(mon).push(gv)
  }

  const loadByTeacher = new Map()
  const uniqueExpertCourseLoads = []
  for (const c of courseRows.recordset || []) {
    const maMon = Number(c.MaMon)
    const year = Number(c.ClassYear)
    const soTiet = Number(c.SoTiet || 0)
    const classCount = classCountByYear.get(year) || 0
    const requiredPeriods = soTiet * classCount
    const experts = expertsByCourse.get(maMon) || []

    if (experts.length === 1 && requiredPeriods > 0) {
      const gv = experts[0]
      loadByTeacher.set(gv, (loadByTeacher.get(gv) || 0) + requiredPeriods)
      uniqueExpertCourseLoads.push({
        maGV: gv,
        maMon,
        tenMon: c.TenMon,
        classYear: year,
        classCount,
        soTiet,
        requiredPeriods,
      })
    }
  }

  const teacherLoads = Array.from(loadByTeacher.entries())
    .map(([maGV, requiredPeriods]) => ({ maGV, requiredPeriods }))
    .sort((a, b) => b.requiredPeriods - a.requiredPeriods)

  console.log(JSON.stringify({
    classCountByYear: Object.fromEntries(classCountByYear),
    topTeacherLoadsFromUniqueExpertCourses: teacherLoads.slice(0, 15),
    sampleUniqueExpertCourses: uniqueExpertCourseLoads.slice(0, 25),
  }, null, 2))

  await pool.close()
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
