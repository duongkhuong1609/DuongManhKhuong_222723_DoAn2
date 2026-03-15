const sql = require('mssql')

const cfg = {
  server: 'localhost',
  instanceName: 'SQLEXPRESS',
  database: 'LAP_LICH_TU_DONG',
  authentication: { type: 'default', options: { userName: 'sa', password: '123456' } },
  options: { encrypt: false, trustServerCertificate: true },
}

const semIds = [31, 32, 33, 34]
const patterns = ['L?p tr?nh cãn b?n', 'L?p tr?nh hý?ng ð?i tý?ng', 'M?ng máy tính', 'Nguyên l? h? ði?u hành', 'Ði?n toán ðám mây', 'Ð? án 1', 'Tri?t h?c']

;(async () => {
  const pool = await new sql.ConnectionPool(cfg).connect()

  const whereLike = patterns.map((_, i) => `m.TenMon LIKE @p${i}`).join(' OR ')
  const req = pool.request()
  patterns.forEach((p, i) => req.input(`p${i}`, `%${p}%`))

  const r = await req.query(`
    SELECT DISTINCT hkm.MaHK, hk.TenHK, hk.NamHK, m.MaMon, m.TenMon, m.SoTiet, m.LoaiMon
    FROM HOC_KY_CAC_MON_HOC hkm
    INNER JOIN HOC_KY hk ON hk.MaHK = hkm.MaHK
    INNER JOIN MON m ON m.MaMon = hkm.MaMon
    WHERE hkm.MaHK IN (${semIds.join(',')})
      AND (${whereLike})
    ORDER BY hkm.MaHK, m.TenMon
  `)

  const rows = []
  for (const row of r.recordset) {
    const expert = await pool.request().input('maMon', Number(row.MaMon)).query(`
      SELECT COUNT(DISTINCT cm.MaGV) AS cnt
      FROM CHUYEN_MON_CUA_GV cm
      INNER JOIN GIANG_VIEN gv ON gv.MaGV = cm.MaGV
      WHERE cm.MaMon = @maMon
        AND LTRIM(RTRIM(ISNULL(gv.TrangThai,''))) = N'Có th? d?y'
    `)
    rows.push({
      MaHK: row.MaHK,
      TenHK: row.TenHK,
      MaMon: row.MaMon,
      TenMon: row.TenMon,
      SoTiet: row.SoTiet,
      LoaiMon: row.LoaiMon,
      ActiveExperts: expert.recordset?.[0]?.cnt || 0,
    })
  }

  console.log(JSON.stringify(rows, null, 2))
  await pool.close()
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
