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
    const countViolation = await pool.request().query(`
      WITH ManagedGV AS (
        SELECT gv.MaGV, gv.MaKhoa,
               UPPER(LTRIM(RTRIM(ISNULL(CAST(gv.TrangThai AS NVARCHAR(50)), '')))) AS st
        FROM GIANG_VIEN gv
      ),
      ValidPairs AS (
        SELECT g.MaGV, cm.MaMon
        FROM ManagedGV g
        INNER JOIN CHUYEN_MON_CUA_GV cm ON cm.MaGV = g.MaGV
        INNER JOIN MON m ON m.MaMon = cm.MaMon
        INNER JOIN NGANH n ON n.MaNganh = m.MaNganh
        WHERE g.st NOT IN (N'VÔ HIỆU HÓA', N'VO HIEU HOA', N'ĐÃ XÓA', N'DA XOA', N'DELETED')
          AND CAST(g.MaKhoa AS NVARCHAR(50)) = CAST(n.MaKhoa AS NVARCHAR(50))
      ),
      LoadByGV AS (
        SELECT g.MaGV, COUNT(DISTINCT v.MaMon) AS soMon
        FROM ManagedGV g
        LEFT JOIN ValidPairs v ON v.MaGV = g.MaGV
        WHERE g.st NOT IN (N'VÔ HIỆU HÓA', N'VO HIEU HOA', N'ĐÃ XÓA', N'DA XOA', N'DELETED')
        GROUP BY g.MaGV
      )
      SELECT COUNT(1) AS cnt
      FROM LoadByGV
      WHERE soMon < 3 OR soMon > 4
    `)

    const crossDeptViolation = await pool.request().query(`
      SELECT COUNT(1) AS cnt
      FROM CHUYEN_MON_CUA_GV cm
      INNER JOIN GIANG_VIEN gv ON gv.MaGV = cm.MaGV
      INNER JOIN MON m ON m.MaMon = cm.MaMon
      INNER JOIN NGANH n ON n.MaNganh = m.MaNganh
      WHERE UPPER(LTRIM(RTRIM(ISNULL(CAST(gv.TrangThai AS NVARCHAR(50)), '')))) NOT IN (
        N'VÔ HIỆU HÓA', N'VO HIEU HOA', N'ĐÃ XÓA', N'DA XOA', N'DELETED'
      )
        AND CAST(gv.MaKhoa AS NVARCHAR(50)) <> CAST(n.MaKhoa AS NVARCHAR(50))
    `)

    console.log(JSON.stringify({
      ok: true,
      countViolations: Number(countViolation.recordset?.[0]?.cnt || 0),
      crossDepartmentViolations: Number(crossDeptViolation.recordset?.[0]?.cnt || 0),
    }, null, 2))
  } finally {
    await pool.close()
  }
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
