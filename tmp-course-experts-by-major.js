const sql = require('mssql')
const cfg = {
  server: 'localhost', instanceName: 'SQLEXPRESS', database: 'LAP_LICH_TU_DONG',
  authentication: { type: 'default', options: { userName: 'sa', password: '123456' } },
  options: { encrypt: false, trustServerCertificate: true },
}

const norm = (v) => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim()
const isActiveGV = (s) => {
  const v = norm(s)
  if (['TAM DUNG', 'INACTIVE', 'NGHI DAY'].includes(v)) return false
  return true
}

;(async () => {
  const pool = await new sql.ConnectionPool(cfg).connect()

  const classRows = (await pool.request().query(`
    SELECT CAST(MaNganh AS NVARCHAR(50)) AS MaNganh, TRY_CONVERT(INT, Nam) AS Nam, COUNT(1) AS Cnt
    FROM LOP
    WHERE TRY_CONVERT(INT, Nam) BETWEEN 1 AND 4
      AND UPPER(LTRIM(RTRIM(ISNULL(TrangThai,'')))) NOT IN (N'Ð? T?T NGHI?P', N'DA TOT NGHIEP')
    GROUP BY MaNganh, TRY_CONVERT(INT, Nam)
  `)).recordset || []

  const classesByMajorYear = new Map()
  for (const r of classRows) classesByMajorYear.set(`${r.MaNganh}_${r.Nam}`, Number(r.Cnt || 0))

  const majorRows = (await pool.request().query(`
    SELECT CAST(n.MaNganh AS NVARCHAR(50)) AS MaNganh, n.TenNganh
    FROM NGANH n
    ORDER BY n.MaNganh
  `)).recordset || []

  const hkRows = (await pool.request().query(`
    SELECT MaHK, TRY_CONVERT(INT, NamHK) AS NamHK
    FROM HOC_KY
    WHERE MaHK IN (31,32,33,34)
  `)).recordset || []
  const hkToYear = new Map(hkRows.map(r => [Number(r.MaHK), Number(r.NamHK)]))

  const courseRows = (await pool.request().query(`
    SELECT CAST(m.MaNganh AS NVARCHAR(50)) AS MaNganh, m.MaMon, m.TenMon, m.LoaiMon, TRY_CONVERT(INT,m.SoTiet) AS SoTiet, h.MaHK
    FROM MON m
    INNER JOIN HOC_KY_CAC_MON_HOC h ON h.MaMon = m.MaMon
    WHERE h.MaHK IN (31,32,33,34)
  `)).recordset || []

  const gvRows = (await pool.request().query(`SELECT MaGV, TrangThai FROM GIANG_VIEN`)).recordset || []
  const activeGV = new Set(gvRows.filter(r => isActiveGV(r.TrangThai)).map(r => String(r.MaGV).trim()))

  const cmRows = (await pool.request().query(`SELECT MaGV, MaMon FROM CHUYEN_MON_CUA_GV`)).recordset || []
  const expertsByCourse = new Map()
  for (const r of cmRows) {
    const gv = String(r.MaGV).trim()
    if (!activeGV.has(gv)) continue
    const mon = Number(r.MaMon)
    if (!expertsByCourse.has(mon)) expertsByCourse.set(mon, new Set())
    expertsByCourse.get(mon).add(gv)
  }

  const majorStats = {}
  for (const m of majorRows) {
    const majorId = String(m.MaNganh)
    const rows = courseRows.filter(r => String(r.MaNganh) === majorId)
    const perCourse = []
    for (const r of rows) {
      const year = hkToYear.get(Number(r.MaHK))
      if (!year || year < 1 || year > 4) continue
      const cls = classesByMajorYear.get(`${majorId}_${year}`) || 0
      const periods = Number(r.SoTiet || 0) * cls
      const experts = (expertsByCourse.get(Number(r.MaMon)) || new Set()).size
      const weekly = periods / 18
      const pressure = experts > 0 ? weekly / (experts * 15) : 999
      perCourse.push({
        maMon: Number(r.MaMon),
        tenMon: String(r.TenMon || '').trim(),
        loaiMon: String(r.LoaiMon || '').trim(),
        nam: year,
        classCount: cls,
        totalPeriods: periods,
        weeklyDemand: Number(weekly.toFixed(2)),
        experts,
        pressure: Number(pressure.toFixed(3)),
      })
    }

    const merged = new Map()
    for (const c of perCourse) {
      const k = `${c.maMon}`
      if (!merged.has(k)) merged.set(k, { ...c })
      else {
        const cur = merged.get(k)
        cur.totalPeriods += c.totalPeriods
        cur.weeklyDemand = Number((cur.totalPeriods / 18).toFixed(2))
        cur.classCount += c.classCount
        cur.nam = Math.min(cur.nam, c.nam)
        cur.pressure = cur.experts > 0 ? Number((cur.weeklyDemand / (cur.experts * 15)).toFixed(3)) : 999
      }
    }

    const top = Array.from(merged.values())
      .filter(c => c.totalPeriods > 0)
      .sort((a, b) => {
        if (b.pressure !== a.pressure) return b.pressure - a.pressure
        return b.weeklyDemand - a.weeklyDemand
      })

    majorStats[majorId] = {
      tenNganh: String(m.TenNganh || '').trim(),
      classesByYear: {
        y1: classesByMajorYear.get(`${majorId}_1`) || 0,
        y2: classesByMajorYear.get(`${majorId}_2`) || 0,
        y3: classesByMajorYear.get(`${majorId}_3`) || 0,
        y4: classesByMajorYear.get(`${majorId}_4`) || 0,
      },
      topBottlenecks: top.slice(0, 20),
    }
  }

  const majorsWithClasses = Object.entries(majorStats).filter(([_, v]) => {
    const c = v.classesByYear
    return (c.y1 + c.y2 + c.y3 + c.y4) > 0
  })

  console.log(JSON.stringify({ majorsWithClasses }, null, 2))

  await pool.close()
})().catch((e) => { console.error(e); process.exit(1) })
