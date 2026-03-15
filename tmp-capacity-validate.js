const sql = require('mssql')
const cfg = {
  server: 'localhost', instanceName: 'SQLEXPRESS', database: 'LAP_LICH_TU_DONG',
  authentication: { type: 'default', options: { userName: 'sa', password: '123456' } },
  options: { encrypt: false, trustServerCertificate: true },
}
const norm = (v) => String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim()
;(async()=>{
  const pool = await new sql.ConnectionPool(cfg).connect()
  const room = (await pool.request().query(`SELECT LoaiPhong, TrangThai, COUNT(1) AS Cnt FROM PHONG GROUP BY LoaiPhong, TrangThai ORDER BY Cnt DESC`)).recordset || []
  const mon = (await pool.request().query(`SELECT m.LoaiMon, COUNT(1) AS Cnt FROM HOC_KY_CAC_MON_HOC h INNER JOIN MON m ON m.MaMon=h.MaMon WHERE h.MaHK IN (31,32,33,34) GROUP BY m.LoaiMon ORDER BY Cnt DESC`)).recordset || []
  const monNames = (await pool.request().query(`SELECT m.TenMon, m.LoaiMon FROM HOC_KY_CAC_MON_HOC h INNER JOIN MON m ON m.MaMon=h.MaMon WHERE h.MaHK IN (31,32,33,34)`)).recordset || []

  const roomByNorm = {}
  for (const r of room) {
    const k = norm(r.LoaiPhong)
    roomByNorm[k] = (roomByNorm[k] || 0) + Number(r.Cnt||0)
  }

  const practiceCourseByName = monNames.filter(r => {
    const n = norm(r.TenMon)
    return n.includes('thuc hanh') || n.includes('lab')
  }).length

  console.log(JSON.stringify({
    topRoomTypeRaw: room.slice(0,12),
    roomTypeNormalizedCounts: Object.entries(roomByNorm).sort((a,b)=>b[1]-a[1]).slice(0,12),
    loaiMonCounts: mon,
    practiceCourseByName
  }, null, 2))
  await pool.close()
})().catch(e=>{console.error(e);process.exit(1)})
