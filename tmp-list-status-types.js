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

  const s1 = await pool.request().query(`
    SELECT TOP 20 LTRIM(RTRIM(ISNULL(TrangThai,''))) AS TrangThai, COUNT(1) AS Cnt
    FROM GIANG_VIEN
    GROUP BY LTRIM(RTRIM(ISNULL(TrangThai,'')))
    ORDER BY Cnt DESC
  `)

  const s2 = await pool.request().query(`
    SELECT TOP 20 LTRIM(RTRIM(ISNULL(LoaiPhong,''))) AS LoaiPhong, COUNT(1) AS Cnt
    FROM PHONG
    GROUP BY LTRIM(RTRIM(ISNULL(LoaiPhong,'')))
    ORDER BY Cnt DESC
  `)

  console.log('GIANG_VIEN TrangThai:')
  console.log(JSON.stringify(s1.recordset, null, 2))
  console.log('PHONG LoaiPhong:')
  console.log(JSON.stringify(s2.recordset, null, 2))

  await pool.close()
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
