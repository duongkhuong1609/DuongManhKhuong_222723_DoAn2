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
  try {
    const rs = await pool.request().query(`
      WITH G AS (
        SELECT gv.MaGV, gv.MaKhoa,
               UPPER(LTRIM(RTRIM(ISNULL(CAST(gv.TrangThai AS NVARCHAR(50)), '')))) AS st
        FROM GIANG_VIEN gv
        WHERE UPPER(LTRIM(RTRIM(ISNULL(CAST(gv.TrangThai AS NVARCHAR(50)), '')))) NOT IN (
          N'ĐÃ XÓA', N'DA XOA', N'DELETED'
        )
      ),
      V AS (
        SELECT g.MaGV, cm.MaMon
        FROM G g
        LEFT JOIN CHUYEN_MON_CUA_GV cm ON cm.MaGV = g.MaGV
        LEFT JOIN MON m ON m.MaMon = cm.MaMon
        LEFT JOIN NGANH n ON n.MaNganh = m.MaNganh
        WHERE cm.MaMon IS NOT NULL
          AND CAST(g.MaKhoa AS NVARCHAR(50)) = CAST(n.MaKhoa AS NVARCHAR(50))
      ),
      L AS (
        SELECT g.MaGV, COUNT(DISTINCT v.MaMon) AS soMon
        FROM G g
        LEFT JOIN V v ON v.MaGV = g.MaGV
        GROUP BY g.MaGV
      )
      SELECT COUNT(1) AS countViolations
      FROM L
      WHERE soMon < 3 OR soMon > 4
    `)

    console.log(JSON.stringify({
      ok: true,
      countViolations: Number(rs.recordset?.[0]?.countViolations || 0),
    }, null, 2))
  } finally {
    await pool.close()
  }
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
