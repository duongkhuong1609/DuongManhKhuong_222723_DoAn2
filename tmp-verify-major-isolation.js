const sql = require('mssql')

const dbConfig = {
  server: 'localhost',
  instanceName: 'SQLEXPRESS',
  database: 'LAP_LICH_TU_DONG',
  authentication: { type: 'default', options: { userName: 'sa', password: '123456' } },
  options: { encrypt: false, trustServerCertificate: true },
}

const ONGOING_STATUS_SQL = `(
  LTRIM(RTRIM(ISNULL(CAST(hk.TrangThai AS NVARCHAR(50)), ''))) IN (N'Đang diễn ra', N'2')
  OR UPPER(LTRIM(RTRIM(ISNULL(CAST(hk.TrangThai AS NVARCHAR(50)), '')))) IN (N'ĐANG DIỄN RA', N'DANG DIEN RA')
)`

async function getColumns(pool, tableName) {
  const rs = await pool
    .request()
    .input('tableName', tableName)
    .query(`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = @tableName`)
  return new Set((rs.recordset || []).map((r) => String(r.COLUMN_NAME || '').toLowerCase()))
}

async function main() {
  const pool = await new sql.ConnectionPool(dbConfig).connect()
  try {
    const semesterColumns = await getColumns(pool, 'HOC_KY')
    const hasMaNganhHK = semesterColumns.has('manganhhk')
    const hasTenNganhHK = semesterColumns.has('tennganhhk')

    const linkRs = await pool.request().query(`
      SELECT TABLE_NAME
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_NAME IN ('HOC_KY_CAC_MON_HOC', 'HOC_KY_CAC_MON')
    `)
    const linkNames = (linkRs.recordset || []).map((r) => String(r.TABLE_NAME || '').trim())
    const linkTable = linkNames.includes('HOC_KY_CAC_MON_HOC')
      ? 'HOC_KY_CAC_MON_HOC'
      : linkNames.includes('HOC_KY_CAC_MON')
        ? 'HOC_KY_CAC_MON'
        : ''

    if (!linkTable) {
      throw new Error('Missing semester-course link table')
    }

    const majorsRs = await pool.request().query(`
      SELECT TOP 12 CAST(n.MaNganh AS NVARCHAR(50)) AS MaNganh, n.TenNganh
      FROM NGANH n
      WHERE EXISTS (
        SELECT 1 FROM LOP l
        WHERE CAST(l.MaNganh AS NVARCHAR(50)) = CAST(n.MaNganh AS NVARCHAR(50))
          AND TRY_CONVERT(INT, l.Nam) BETWEEN 1 AND 4
      )
      ORDER BY n.MaNganh
    `)

    const report = []

    for (const major of majorsRs.recordset || []) {
      const majorId = String(major.MaNganh || '').trim()
      const majorName = String(major.TenNganh || '').trim()
      if (!majorId) continue

      const classYearRs = await pool.request().input('majorId', majorId).query(`
        SELECT DISTINCT TRY_CONVERT(INT, l.Nam) AS Nam
        FROM LOP l
        WHERE CAST(l.MaNganh AS NVARCHAR(50)) = @majorId
          AND TRY_CONVERT(INT, l.Nam) BETWEEN 1 AND 4
          AND UPPER(LTRIM(RTRIM(ISNULL(CAST(l.TrangThai AS NVARCHAR(50)), '')))) NOT IN (N'ĐÃ TỐT NGHIỆP', N'DA TOT NGHIEP')
      `)
      const classYears = (classYearRs.recordset || [])
        .map((r) => Number(r.Nam))
        .filter((n) => Number.isFinite(n) && n > 0)

      if (!classYears.length) {
        report.push({ majorId, majorName, semesters: 0, totalCourses: 0, leakedCourses: 0, note: 'no-class-years' })
        continue
      }

      const semesterRequest = pool.request()
      const whereClauses = []

      if (hasMaNganhHK) {
        semesterRequest.input('majorId', majorId)
        whereClauses.push(`CAST(hk.MaNganhHK AS NVARCHAR(50)) = @majorId`)
      } else if (hasTenNganhHK) {
        semesterRequest.input('majorName', majorName)
        whereClauses.push(`LTRIM(RTRIM(ISNULL(hk.TenNganhHK, ''))) = @majorName`)
      }

      classYears.forEach((year, idx) => {
        semesterRequest.input(`classYear${idx}`, sql.Int, year)
      })
      whereClauses.push(`TRY_CONVERT(INT, hk.NamHK) IN (${classYears.map((_, i) => `@classYear${i}`).join(',')})`)

      if (!whereClauses.length) {
        report.push({ majorId, majorName, semesters: 0, totalCourses: 0, leakedCourses: 0, note: 'no-semester-filters' })
        continue
      }

      const semesterRs = await semesterRequest.query(`
        SELECT CAST(hk.MaHK AS NVARCHAR(50)) AS MaHK
        FROM HOC_KY hk
        WHERE (${whereClauses.join(' AND ')})
          AND ${ONGOING_STATUS_SQL}
      `)

      const semesterIds = (semesterRs.recordset || []).map((r) => String(r.MaHK || '').trim()).filter(Boolean)
      if (!semesterIds.length) {
        report.push({ majorId, majorName, semesters: 0, totalCourses: 0, leakedCourses: 0, note: 'no-ongoing-semesters' })
        continue
      }

      const req = pool.request().input('majorId', majorId)
      semesterIds.forEach((id, idx) => req.input(`semesterId${idx}`, id))

      const totalRs = await req.query(`
        SELECT COUNT(1) AS Cnt
        FROM ${linkTable} hkm
        INNER JOIN MON m ON m.MaMon = hkm.MaMon
        WHERE CAST(hkm.MaHK AS NVARCHAR(50)) IN (${semesterIds.map((_, i) => `@semesterId${i}`).join(',')})
      `)

      const leakedRs = await req.query(`
        SELECT COUNT(1) AS Cnt
        FROM ${linkTable} hkm
        INNER JOIN MON m ON m.MaMon = hkm.MaMon
        WHERE CAST(hkm.MaHK AS NVARCHAR(50)) IN (${semesterIds.map((_, i) => `@semesterId${i}`).join(',')})
          AND CAST(m.MaNganh AS NVARCHAR(50)) <> @majorId
      `)

      report.push({
        majorId,
        majorName,
        semesters: semesterIds.length,
        totalCourses: Number(totalRs.recordset?.[0]?.Cnt || 0),
        leakedCourses: Number(leakedRs.recordset?.[0]?.Cnt || 0),
      })
    }

    const summary = {
      checkedMajors: report.length,
      majorsWithLeak: report.filter((r) => r.leakedCourses > 0).length,
      totalLeakedCourses: report.reduce((acc, r) => acc + Number(r.leakedCourses || 0), 0),
    }

    console.log(JSON.stringify({ summary, report }, null, 2))
  } finally {
    await pool.close()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
