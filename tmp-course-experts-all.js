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
  const q = `
    SELECT
      m.MaMon,
      m.TenMon,
      m.SoTiet,
      m.LoaiMon,
      COUNT(DISTINCT CASE WHEN LTRIM(RTRIM(ISNULL(gv.TrangThai,''))) = N'Có th? d?y' THEN cm.MaGV END) AS ActiveExperts
    FROM HOC_KY_CAC_MON_HOC hkm
    INNER JOIN MON m ON m.MaMon = hkm.MaMon
    LEFT JOIN CHUYEN_MON_CUA_GV cm ON cm.MaMon = m.MaMon
    LEFT JOIN GIANG_VIEN gv ON gv.MaGV = cm.MaGV
    WHERE hkm.MaHK IN (31,32,33,34)
    GROUP BY m.MaMon, m.TenMon, m.SoTiet, m.LoaiMon
    ORDER BY ActiveExperts ASC, m.MaMon
  `
  const r = await pool.request().query(q)
  console.log(JSON.stringify(r.recordset, null, 2))
  await pool.close()
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
