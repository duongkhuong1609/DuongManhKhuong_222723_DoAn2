const sql = require('mssql')
const cfg = {
  server: 'localhost', instanceName: 'SQLEXPRESS', database: 'LAP_LICH_TU_DONG',
  authentication: { type: 'default', options: { userName: 'sa', password: '123456' } },
  options: { encrypt: false, trustServerCertificate: true },
}
const norm = (v) => String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim()
const isActiveTeacher = (s) => {
  const v = norm(s)
  return !['tam dung','inactive','nghi day'].includes(v)
}
;(async()=>{
  const pool = await new sql.ConnectionPool(cfg).connect()

  const classes = (await pool.request().query(`
    SELECT TRY_CONVERT(INT, Nam) AS Nam, CAST(MaNganh AS NVARCHAR(50)) AS MaNganh
    FROM LOP
    WHERE TRY_CONVERT(INT, Nam) BETWEEN 1 AND 4
      AND UPPER(LTRIM(RTRIM(ISNULL(TrangThai,'')))) NOT IN (N'Ð? T?T NGHI?P', N'DA TOT NGHIEP')
  `)).recordset || []

  const byYear = new Map()
  for (const c of classes) byYear.set(Number(c.Nam), (byYear.get(Number(c.Nam)) || 0) + 1)

  const semesterRows = (await pool.request().query(`SELECT MaHK, TRY_CONVERT(INT, NamHK) AS NamHK FROM HOC_KY WHERE MaHK IN (31,32,33,34)`)).recordset || []
  const hkByYear = new Map()
  for (const s of semesterRows) hkByYear.set(Number(s.NamHK), Number(s.MaHK))

  const courseRows = (await pool.request().query(`
    SELECT h.MaHK, TRY_CONVERT(INT,m.SoTiet) AS SoTiet, m.LoaiMon, m.TenMon
    FROM HOC_KY_CAC_MON_HOC h
    INNER JOIN MON m ON m.MaMon = h.MaMon
    WHERE h.MaHK IN (31,32,33,34)
  `)).recordset || []

  const periodsPerClassByYear = {}
  const practicePerClassByYear = {}
  for (const y of [1,2,3,4]) {
    const hk = hkByYear.get(y)
    const rows = courseRows.filter(r => Number(r.MaHK) === hk)
    periodsPerClassByYear[y] = rows.reduce((s,r)=>s+Number(r.SoTiet||0),0)
    practicePerClassByYear[y] = rows
      .filter(r => norm(r.LoaiMon).includes('thuc hanh') || norm(r.TenMon).includes('thuc hanh') || norm(r.TenMon).includes('lab'))
      .reduce((s,r)=>s+Number(r.SoTiet||0),0)
  }

  const rooms = (await pool.request().query(`SELECT LoaiPhong, TrangThai FROM PHONG`)).recordset || []
  const activeRooms = rooms.filter(r => {
    const st = norm(r.TrangThai)
    return !['bao tri','khoa','inactive'].includes(st)
  })
  const practiceRooms = activeRooms.filter(r => norm(r.LoaiPhong).includes('thuc hanh') || norm(r.LoaiPhong).includes('lab') || norm(r.LoaiPhong).includes('may'))

  const teachers = (await pool.request().query(`SELECT TrangThai FROM GIANG_VIEN`)).recordset || []
  const activeTeachers = teachers.filter(t => isActiveTeacher(t.TrangThai)).length

  const currentTotalClasses = [1,2,3,4].reduce((s,y)=>s+(byYear.get(y)||0),0)
  const extraClasses = 80
  const extraByYear = {}
  let allocated = 0
  for (const y of [1,2,3,4]) {
    const ratio = currentTotalClasses ? (byYear.get(y)||0)/currentTotalClasses : 0.25
    const n = Math.round(extraClasses * ratio)
    extraByYear[y] = n
    allocated += n
  }
  if (allocated !== extraClasses) extraByYear[1] += (extraClasses - allocated)

  let currentPeriods = 0, afterPeriods = 0, currentPractice = 0, afterPractice = 0
  for (const y of [1,2,3,4]) {
    const curCls = byYear.get(y)||0
    const aftCls = curCls + (extraByYear[y]||0)
    const per = periodsPerClassByYear[y]||0
    const pper = practicePerClassByYear[y]||0
    currentPeriods += curCls*per
    afterPeriods += aftCls*per
    currentPractice += curCls*pper
    afterPractice += aftCls*pper
  }

  const weeks = 18
  const weeklyCurrent = currentPeriods/weeks
  const weeklyAfter = afterPeriods/weeks
  const weeklyPracticeAfter = afterPractice/weeks

  const teacherNeedSoftCurrent = Math.ceil(weeklyCurrent/15)
  const teacherNeedSoftAfter = Math.ceil(weeklyAfter/15)
  const teacherNeedNominalAfter = Math.ceil(weeklyAfter/18)

  const roomCapNominal = activeRooms.length * 6 * 12
  const practiceRoomCapNominal = practiceRooms.length * 6 * 12

  console.log(JSON.stringify({
    classesByYear: Object.fromEntries(Array.from(byYear.entries())),
    periodsPerClassByYear,
    practicePerClassByYear,
    currentTotalClasses,
    extraByYear,
    resources: { activeTeachers, activeRooms: activeRooms.length, practiceRooms: practiceRooms.length },
    weeklyDemand: {
      currentAll: Number(weeklyCurrent.toFixed(1)),
      afterAll: Number(weeklyAfter.toFixed(1)),
      afterPractice: Number(weeklyPracticeAfter.toFixed(1))
    },
    teacherNeed: {
      softCurrent: teacherNeedSoftCurrent,
      softAfter: teacherNeedSoftAfter,
      nominalAfter: teacherNeedNominalAfter,
      currentAvailable: activeTeachers,
      shortageSoftAfter: Math.max(0, teacherNeedSoftAfter - activeTeachers),
      shortageNominalAfter: Math.max(0, teacherNeedNominalAfter - activeTeachers),
    },
    roomUtilizationAfter: {
      allRoomsNominalPct: Number((weeklyAfter/roomCapNominal*100).toFixed(1)),
      practiceRoomsNominalPct: practiceRoomCapNominal ? Number((weeklyPracticeAfter/practiceRoomCapNominal*100).toFixed(1)) : null
    }
  }, null, 2))

  await pool.close()
})().catch(e=>{console.error(e);process.exit(1)})
