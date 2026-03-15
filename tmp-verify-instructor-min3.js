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
      SELECT COUNT(1) AS remainingBelow3
      FROM (
        SELECT gv.MaGV, COUNT(DISTINCT cm.MaMon) AS soMon
        FROM GIANG_VIEN gv
        LEFT JOIN CHUYEN_MON_CUA_GV cm ON cm.MaGV = gv.MaGV
        WHERE UPPER(LTRIM(RTRIM(ISNULL(gv.TrangThai, '')))) IN (
          N'CÓ THỂ DẠY', N'CO THE DAY',
          N'ACTIVE', N'HOẠT ĐỘNG', N'HOAT DONG',
          N'ĐANG DẠY', N'DANG DAY', N''
        )
          AND UPPER(LTRIM(RTRIM(ISNULL(gv.TrangThai, '')))) NOT IN (
            N'TẠM DỪNG', N'TAM DUNG',
            N'TẠM NGƯNG', N'TAM NGUNG',
            N'VÔ HIỆU HÓA', N'VO HIEU HOA'
          )
        GROUP BY gv.MaGV
        HAVING COUNT(DISTINCT cm.MaMon) < 3
      ) x
    `)

    const detail = await pool.request().query(`
      SELECT gv.MaGV, gv.TenGV, COUNT(DISTINCT cm.MaMon) AS soMon
      FROM GIANG_VIEN gv
      LEFT JOIN CHUYEN_MON_CUA_GV cm ON cm.MaGV = gv.MaGV
      WHERE UPPER(LTRIM(RTRIM(ISNULL(gv.TrangThai, '')))) IN (
        N'CÓ THỂ DẠY', N'CO THE DAY',
        N'ACTIVE', N'HOẠT ĐỘNG', N'HOAT DONG',
        N'ĐANG DẠY', N'DANG DAY', N''
      )
        AND UPPER(LTRIM(RTRIM(ISNULL(gv.TrangThai, '')))) NOT IN (
          N'TẠM DỪNG', N'TAM DUNG',
          N'TẠM NGƯNG', N'TAM NGUNG',
          N'VÔ HIỆU HÓA', N'VO HIEU HOA'
        )
      GROUP BY gv.MaGV, gv.TenGV
      HAVING COUNT(DISTINCT cm.MaMon) < 3
      ORDER BY soMon ASC, gv.MaGV ASC
    `)

    console.log(JSON.stringify({
      ok: true,
      remainingBelow3: Number(rs.recordset?.[0]?.remainingBelow3 || 0),
      sample: (detail.recordset || []).slice(0, 10),
    }, null, 2))
  } finally {
    await pool.close()
  }
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
