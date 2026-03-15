const sql = require('mssql')

const cfg = {
  server: 'localhost',
  instanceName: 'SQLEXPRESS',
  database: 'LAP_LICH_TU_DONG',
  authentication: { type: 'default', options: { userName: 'sa', password: '123456' } },
  options: { encrypt: false, trustServerCertificate: true },
}

const semIds = [31, 32, 33, 34]
const targets = [
  'L?p tr?nh cãn b?n',
  'L?p tr?nh cãn b?n - Th?c hành',
  'L?p tr?nh hý?ng ð?i tý?ng - Th?c hành',
  'M?ng máy tính - Th?c hành',
  'Nguyên l? h? ði?u hành - Th?c hành',
  'Ði?n toán ðám mây - Th?c hành',
  'Ði?n toán ðám mây',
  'Ð? án 1 - cõ s? CNTT',
  'Tri?t h?c',
]

;(async () => {
  const pool = await new sql.ConnectionPool(cfg).connect()

  const roomStats = await pool.request().query(`
    SELECT
      COUNT(1) AS totalRooms,
      SUM(CASE WHEN UPPER(LTRIM(RTRIM(ISNULL(TrangThai, '')))) NOT IN (N'B?O TR?', N'BAO TRI', N'KHÓA', N'KHOA', N'INACTIVE') THEN 1 ELSE 0 END) AS activeRooms,
      SUM(CASE WHEN UPPER(LTRIM(RTRIM(ISNULL(TrangThai, '')))) NOT IN (N'B?O TR?', N'BAO TRI', N'KHÓA', N'KHOA', N'INACTIVE') AND LOWER(ISNULL(LoaiPhong,'')) LIKE N'%th?c hành%' THEN 1 ELSE 0 END) AS activePracticeRooms
    FROM PHONG
  `)

  const activeInstructorStats = await pool.request().query(`
    SELECT COUNT(1) AS activeInstructors
    FROM GIANG_VIEN gv
    WHERE UPPER(LTRIM(RTRIM(ISNULL(gv.TrangThai, '')))) IN (N'CÓ TH? D?Y', N'CO THE DAY', N'ACTIVE', N'HO?T Ð?NG', N'HOAT DONG', N'ÐANG D?Y', N'DANG DAY', N'')
      AND UPPER(LTRIM(RTRIM(ISNULL(gv.TrangThai, '')))) NOT IN (N'T?M D?NG', N'TAM DUNG')
  `)

  const classesByYear = await pool.request().query(`
    SELECT TRY_CONVERT(INT, Nam) AS Nam, COUNT(1) AS classCount
    FROM LOP
    WHERE CAST(MaNganh AS NVARCHAR(50)) = '1'
    GROUP BY TRY_CONVERT(INT, Nam)
    ORDER BY TRY_CONVERT(INT, Nam)
  `)

  const targetCourseRows = []
  for (const name of targets) {
    const c = await pool.request().input('name', name).query(`
      SELECT TOP 1 MaMon, TenMon, SoTiet, LoaiMon
      FROM MON
      WHERE LTRIM(RTRIM(TenMon)) = @name
    `)
    if (c.recordset?.[0]) targetCourseRows.push(c.recordset[0])
  }

  const results = []
  for (const row of targetCourseRows) {
    const maMon = Number(row.MaMon)

    const expertCount = await pool.request().input('maMon', maMon).query(`
      SELECT COUNT(DISTINCT cm.MaGV) AS cnt
      FROM CHUYEN_MON_CUA_GV cm
      INNER JOIN GIANG_VIEN gv ON gv.MaGV = cm.MaGV
      WHERE cm.MaMon = @maMon
        AND UPPER(LTRIM(RTRIM(ISNULL(gv.TrangThai, '')))) IN (N'CÓ TH? D?Y', N'CO THE DAY', N'ACTIVE', N'HO?T Ð?NG', N'HOAT DONG', N'ÐANG D?Y', N'DANG DAY', N'')
        AND UPPER(LTRIM(RTRIM(ISNULL(gv.TrangThai, '')))) NOT IN (N'T?M D?NG', N'TAM DUNG')
    `)

    const semesterLinks = await pool.request().input('maMon', maMon).query(`
      SELECT hkm.MaHK, hk.TenHK, hk.NamHK
      FROM HOC_KY_CAC_MON_HOC hkm
      INNER JOIN HOC_KY hk ON hk.MaHK = hkm.MaHK
      WHERE hkm.MaMon = @maMon AND hkm.MaHK IN (${semIds.join(',')})
      ORDER BY hkm.MaHK
    `)

    results.push({
      course: String(row.TenMon),
      maMon,
      soTiet: Number(row.SoTiet || 0),
      loaiMon: String(row.LoaiMon || ''),
      activeExpertTeachers: Number(expertCount.recordset?.[0]?.cnt || 0),
      linkedSemestersInRun: semesterLinks.recordset || [],
    })
  }

  console.log(JSON.stringify({
    semIds,
    activeInstructors: activeInstructorStats.recordset?.[0]?.activeInstructors || 0,
    roomStats: roomStats.recordset?.[0] || {},
    classesByYear: classesByYear.recordset || [],
    targetCourses: results,
  }, null, 2))

  await pool.close()
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
