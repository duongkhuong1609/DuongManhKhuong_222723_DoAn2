const sql = require('mssql')
const cfg = {
  server: 'localhost', instanceName: 'SQLEXPRESS', database: 'LAP_LICH_TU_DONG',
  authentication: { type: 'default', options: { userName: 'sa', password: '123456' } },
  options: { encrypt: false, trustServerCertificate: true },
}
;(async()=>{
  const pool = await new sql.ConnectionPool(cfg).connect()
  const majorRows = (await pool.request().query(`
    SELECT CAST(l.MaNganh AS NVARCHAR(50)) AS MaNganh, COUNT(1) AS ClassCount
    FROM LOP l
    WHERE TRY_CONVERT(INT, l.Nam) BETWEEN 1 AND 4
      AND UPPER(LTRIM(RTRIM(ISNULL(l.TrangThai,'')))) NOT IN (N'Ð? T?T NGHI?P', N'DA TOT NGHIEP')
    GROUP BY l.MaNganh
    ORDER BY COUNT(1) DESC
  `)).recordset || []
  console.log(JSON.stringify({ topMajorsByClassCount: majorRows.slice(0,10), totalMajors: majorRows.length }, null, 2))
  await pool.close()
})().catch(e=>{console.error(e);process.exit(1)})
