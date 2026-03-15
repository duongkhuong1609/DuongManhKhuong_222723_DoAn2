const sql = require('mssql')

const cfg = {
  server: 'localhost',
  instanceName: 'SQLEXPRESS',
  database: 'LAP_LICH_TU_DONG',
  authentication: { type: 'default', options: { userName: 'sa', password: '123456' } },
  options: { encrypt: false, trustServerCertificate: true },
}

function isActiveStatus(s) {
  const v = String(s || '').trim().toUpperCase()
  return !['T?M D?NG','TAM DUNG','INACTIVE','NGH? D?Y','NGHI DAY'].includes(v)
}

;(async () => {
  const pool = await new sql.ConnectionPool(cfg).connect()

  const semRows = (await pool.request().query(`
    SELECT MaHK, TenHK, TRY_CONVERT(INT, NamHK) AS NamHK
    FROM HOC_KY
    WHERE MaHK IN (31,32,33,34)
    ORDER BY MaHK
  `)).recordset || []

  const semByYear = new Map()
  for (const s of semRows) {
    const y = Number(s.NamHK)
    if (Number.isFinite(y) && y > 0 && !semByYear.has(y)) semByYear.set(y, Number(s.MaHK))
  }

  const classRows = (await pool.request().query(`
    SELECT MaLop, TenLop, TRY_CONVERT(INT, Nam) AS Nam, MaNganh, TrangThai
    FROM LOP
    WHERE TRY_CONVERT(INT, Nam) BETWEEN 1 AND 4
      AND UPPER(LTRIM(RTRIM(ISNULL(TrangThai,'')))) NOT IN (N'Ð? T?T NGHI?P', N'DA TOT NGHIEP')
  `)).recordset || []

  const classesByYear = new Map()
  for (const c of classRows) {
    const y = Number(c.Nam)
    classesByYear.set(y, (classesByYear.get(y) || 0) + 1)
  }

  const periodRows = (await pool.request().query(`
    SELECT hkm.MaHK, TRY_CONVERT(INT, m.SoTiet) AS SoTiet,
           m.MaMon, m.TenMon, m.LoaiMon
    FROM HOC_KY_CAC_MON_HOC hkm
    INNER JOIN MON m ON m.MaMon = hkm.MaMon
    WHERE hkm.MaHK IN (31,32,33,34)
  `)).recordset || []

  const periodsPerClassByYear = new Map()
  const practicePeriodsPerClassByYear = new Map()
  const coursesByYear = new Map()

  for (const y of [1,2,3,4]) {
    const hk = semByYear.get(y)
    if (!hk) continue
    const rows = periodRows.filter(r => Number(r.MaHK) === hk)
    periodsPerClassByYear.set(y, rows.reduce((s, r) => s + Number(r.SoTiet || 0), 0))
    practicePeriodsPerClassByYear.set(y, rows
      .filter(r => String(r.LoaiMon || '').toLowerCase().includes('th?c hành') || String(r.TenMon || '').toLowerCase().includes('th?c hành'))
      .reduce((s, r) => s + Number(r.SoTiet || 0), 0)
    )
    coursesByYear.set(y, rows)
  }

  const instructorRows = (await pool.request().query(`
    SELECT MaGV, TrangThai
    FROM GIANG_VIEN
  `)).recordset || []

  const activeInstructors = instructorRows.filter(r => isActiveStatus(r.TrangThai)).length

  const roomRows = (await pool.request().query(`
    SELECT MaPhong, LoaiPhong, TrangThai
    FROM PHONG
  `)).recordset || []

  const activeRooms = roomRows.filter(r => {
    const st = String(r.TrangThai || '').trim().toUpperCase()
    return !['B?O TR?','BAO TRI','KHÓA','KHOA','INACTIVE'].includes(st)
  })
  const activePracticeRooms = activeRooms.filter(r => String(r.LoaiPhong || '').toLowerCase().includes('th?c hành'))

  // Current demand snapshot (4 semester IDs mapped to year 1..4)
  let currentTotalPeriods = 0
  let currentPracticePeriods = 0
  for (const y of [1,2,3,4]) {
    const cls = classesByYear.get(y) || 0
    currentTotalPeriods += cls * (periodsPerClassByYear.get(y) || 0)
    currentPracticePeriods += cls * (practicePeriodsPerClassByYear.get(y) || 0)
  }

  // Add 80 new classes with same year ratio as current
  const currentClassTotal = [1,2,3,4].reduce((s, y) => s + (classesByYear.get(y) || 0), 0)
  const extraClasses = 80
  const extraByYear = new Map()
  let assigned = 0
  for (const y of [1,2,3,4]) {
    const ratio = currentClassTotal > 0 ? (classesByYear.get(y) || 0) / currentClassTotal : 0.25
    const n = Math.round(extraClasses * ratio)
    extraByYear.set(y, n)
    assigned += n
  }
  if (assigned !== extraClasses) extraByYear.set(1, (extraByYear.get(1) || 0) + (extraClasses - assigned))

  let extraTotalPeriods = 0
  let extraPracticePeriods = 0
  for (const y of [1,2,3,4]) {
    const cls = extraByYear.get(y) || 0
    extraTotalPeriods += cls * (periodsPerClassByYear.get(y) || 0)
    extraPracticePeriods += cls * (practicePeriodsPerClassByYear.get(y) || 0)
  }

  const totalAfterPeriods = currentTotalPeriods + extraTotalPeriods
  const totalAfterPracticePeriods = currentPracticePeriods + extraPracticePeriods

  // Semester has ~18 teaching weeks
  const weeks = 18
  const weeklyDemandCurrent = currentTotalPeriods / weeks
  const weeklyDemandAfter = totalAfterPeriods / weeks
  const weeklyPracticeDemandAfter = totalAfterPracticePeriods / weeks

  // Capacity envelopes
  const roomCapConservative = activeRooms.length * 6 * 10
  const roomCapNominal = activeRooms.length * 6 * 12
  const roomCapHigh = activeRooms.length * 7 * 12

  const practiceRoomCapConservative = activePracticeRooms.length * 6 * 10
  const practiceRoomCapNominal = activePracticeRooms.length * 6 * 12
  const practiceRoomCapHigh = activePracticeRooms.length * 7 * 12

  const teacherCapSoft = activeInstructors * 15
  const teacherCapNominal = activeInstructors * 18

  // Unique-expert bottleneck estimate (for selected 4 HK)
  const expertRows = (await pool.request().query(`
    SELECT cm.MaMon, cm.MaGV, gv.TrangThai
    FROM CHUYEN_MON_CUA_GV cm
    INNER JOIN GIANG_VIEN gv ON gv.MaGV = cm.MaGV
  `)).recordset || []

  const activeExpertsByCourse = new Map()
  for (const e of expertRows) {
    if (!isActiveStatus(e.TrangThai)) continue
    const mon = Number(e.MaMon)
    if (!activeExpertsByCourse.has(mon)) activeExpertsByCourse.set(mon, new Set())
    activeExpertsByCourse.get(mon).add(Number(e.MaGV))
  }

  const uniqueLoadByTeacherCurrent = new Map()
  const uniqueLoadByTeacherAfter = new Map()

  for (const y of [1,2,3,4]) {
    const rows = coursesByYear.get(y) || []
    const classCountCurrent = classesByYear.get(y) || 0
    const classCountAfter = classCountCurrent + (extraByYear.get(y) || 0)

    for (const r of rows) {
      const mon = Number(r.MaMon)
      const soTiet = Number(r.SoTiet || 0)
      const experts = activeExpertsByCourse.get(mon)
      if (!experts || experts.size !== 1) continue
      const gv = Array.from(experts)[0]
      uniqueLoadByTeacherCurrent.set(gv, (uniqueLoadByTeacherCurrent.get(gv) || 0) + soTiet * classCountCurrent)
      uniqueLoadByTeacherAfter.set(gv, (uniqueLoadByTeacherAfter.get(gv) || 0) + soTiet * classCountAfter)
    }
  }

  const topUniqueAfter = Array.from(uniqueLoadByTeacherAfter.entries())
    .map(([maGV, periods]) => ({ maGV, periods, perWeek: periods / weeks }))
    .sort((a,b) => b.periods - a.periods)
    .slice(0, 10)

  const overloadUniqueSoft = topUniqueAfter.filter(x => x.perWeek > 15)
  const overloadUniqueNominal = topUniqueAfter.filter(x => x.perWeek > 18)

  const out = {
    semesterMapYearToHK: Object.fromEntries(Array.from(semByYear.entries())),
    classesByYear: Object.fromEntries(Array.from(classesByYear.entries())),
    periodsPerClassByYear: Object.fromEntries(Array.from(periodsPerClassByYear.entries())),
    practicePeriodsPerClassByYear: Object.fromEntries(Array.from(practicePeriodsPerClassByYear.entries())),
    currentClassTotal,
    extraByYear: Object.fromEntries(Array.from(extraByYear.entries())),
    resources: {
      activeInstructors,
      activeRooms: activeRooms.length,
      activePracticeRooms: activePracticeRooms.length,
      teacherCapSoft,
      teacherCapNominal,
      roomCapConservative,
      roomCapNominal,
      roomCapHigh,
      practiceRoomCapConservative,
      practiceRoomCapNominal,
      practiceRoomCapHigh,
    },
    demandPerWeek: {
      currentAll: Number(weeklyDemandCurrent.toFixed(2)),
      afterAll: Number(weeklyDemandAfter.toFixed(2)),
      afterPracticeOnly: Number(weeklyPracticeDemandAfter.toFixed(2)),
    },
    utilizationAfter: {
      teacherVsSoft: teacherCapSoft > 0 ? Number((weeklyDemandAfter / teacherCapSoft * 100).toFixed(1)) : null,
      teacherVsNominal: teacherCapNominal > 0 ? Number((weeklyDemandAfter / teacherCapNominal * 100).toFixed(1)) : null,
      roomVsConservative: roomCapConservative > 0 ? Number((weeklyDemandAfter / roomCapConservative * 100).toFixed(1)) : null,
      roomVsNominal: roomCapNominal > 0 ? Number((weeklyDemandAfter / roomCapNominal * 100).toFixed(1)) : null,
      practiceRoomVsConservative: practiceRoomCapConservative > 0 ? Number((weeklyPracticeDemandAfter / practiceRoomCapConservative * 100).toFixed(1)) : null,
      practiceRoomVsNominal: practiceRoomCapNominal > 0 ? Number((weeklyPracticeDemandAfter / practiceRoomCapNominal * 100).toFixed(1)) : null,
    },
    uniqueExpertBottleneck: {
      overloadSoftCount: overloadUniqueSoft.length,
      overloadNominalCount: overloadUniqueNominal.length,
      topUniqueAfter,
    }
  }

  console.log(JSON.stringify(out, null, 2))
  await pool.close()
})().catch((e) => { console.error(e); process.exit(1) })
