const sql = require('mssql')

const cfg = {
  server: 'localhost',
  instanceName: 'SQLEXPRESS',
  database: 'LAP_LICH_TU_DONG',
  authentication: { type: 'default', options: { userName: 'sa', password: '123456' } },
  requestTimeout: 120000,
  options: { encrypt: false, trustServerCertificate: true },
}

;(async () => {
  const pool = await new sql.ConnectionPool(cfg).connect()
  try {
    const rs = await pool.request().query(`
      WITH EligibleGV AS (
        SELECT gv.MaGV, gv.MaKhoa
        FROM GIANG_VIEN gv
        WHERE UPPER(LTRIM(RTRIM(ISNULL(CAST(gv.TrangThai AS NVARCHAR(50)), '')))) NOT IN (
          N'VÔ HIỆU HÓA', N'VO HIEU HOA', N'ĐÃ XÓA', N'DA XOA', N'DELETED'
        )
      ),
      CourseDept AS (
        SELECT m.MaMon, n.MaKhoa
        FROM MON m
        INNER JOIN NGANH n ON n.MaNganh = m.MaNganh
      ),
      ValidPairs AS (
        SELECT DISTINCT cm.MaGV, cm.MaMon
        FROM CHUYEN_MON_CUA_GV cm
        INNER JOIN EligibleGV gv ON gv.MaGV = cm.MaGV
        INNER JOIN CourseDept cd ON cd.MaMon = cm.MaMon
        WHERE CAST(gv.MaKhoa AS NVARCHAR(50)) = CAST(cd.MaKhoa AS NVARCHAR(50))
      ),
      LoadByGV AS (
        SELECT gv.MaGV, COUNT(DISTINCT vp.MaMon) AS courseCount
        FROM EligibleGV gv
        LEFT JOIN ValidPairs vp ON vp.MaGV = gv.MaGV
        GROUP BY gv.MaGV
      ),
      ExpertByCourse AS (
        SELECT cd.MaMon, COUNT(DISTINCT vp.MaGV) AS expertCount
        FROM CourseDept cd
        LEFT JOIN ValidPairs vp ON vp.MaMon = cd.MaMon
        GROUP BY cd.MaMon
      )
      SELECT
        (SELECT COUNT(1) FROM CourseDept) AS totalCourses,
        (SELECT COUNT(1) FROM EligibleGV) AS totalEligibleInstructors,
        (SELECT SUM(expertCount) FROM ExpertByCourse) AS totalValidAssignments,
        (SELECT SUM(CASE WHEN expertCount < 3 THEN 1 ELSE 0 END) FROM ExpertByCourse) AS deficientCourses,
        (SELECT SUM(CASE WHEN courseCount >= 5 THEN 1 ELSE 0 END) FROM LoadByGV) AS instructorsAtOrAboveMax,
        (SELECT SUM(CASE WHEN courseCount < 5 THEN 5 - courseCount ELSE 0 END) FROM LoadByGV) AS totalRemainingSlots,
        (SELECT COUNT(1) * 3 FROM CourseDept) AS requiredAssignmentsAtMin3
    `)

    console.log(JSON.stringify({ ok: true, data: rs.recordset?.[0] || {} }, null, 2))
  } finally {
    await pool.close()
  }
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
