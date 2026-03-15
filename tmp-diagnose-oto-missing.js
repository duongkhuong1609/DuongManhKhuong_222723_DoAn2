const sql = require('mssql')

const cfg = {
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

const normalizeVietnameseText = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u2013\u2014]/g, '-')
    .toLowerCase()
    .trim()

const isThesisCourse = (courseName) => {
  const normalized = normalizeVietnameseText(courseName)
  if (!normalized) return false
  return (
    normalized.includes('khoa luan tot nghiep') ||
    normalized.includes('do an tot nghiep') ||
    normalized.includes('luan van tot nghiep')
  )
}

const isFinalInternshipCourse = (courseName) => {
  const normalized = normalizeVietnameseText(courseName)
  return normalized.includes('thuc tap cuoi khoa')
}

const isExcludedFromScheduleCourse = (courseName) => {
  return isThesisCourse(courseName) || isFinalInternshipCourse(courseName)
}

const isPracticeCourseType = (courseType, courseName) => {
  const normalizedType = normalizeVietnameseText(courseType)
  if (normalizedType.includes('thuc hanh')) return true
  const normalizedName = normalizeVietnameseText(courseName)
  return /(?:[-_\s(\[]+)?thuc hanh(?:\s*\d+)?\s*[)\]]?$/.test(normalizedName)
}

;(async () => {
  const pool = await new sql.ConnectionPool(cfg).connect()

  const classNames = [
    'DH25OTO01','DH25OTO02','DH25OTO03','DH25OTO04','DH25OTO05',
    'DH24OTO01','DH24OTO02','DH24OTO03','DH24OTO04','DH24OTO05',
    'DH22OTO01','DH22OTO02'
  ]

  const classReq = pool.request()
  classNames.forEach((name, idx) => classReq.input(`c${idx}`, sql.NVarChar(50), name))
  const classRows = (await classReq.query(`
    SELECT MaLop, TenLop, TRY_CONVERT(INT, Nam) AS Nam, CAST(MaNganh AS NVARCHAR(50)) AS MaNganh
    FROM LOP
    WHERE TenLop IN (${classNames.map((_, idx) => `@c${idx}`).join(',')})
    ORDER BY TenLop
  `)).recordset || []

  if (!classRows.length) {
    console.log(JSON.stringify({ error: 'Không tìm thấy các lớp OTO trong thông báo lỗi.' }, null, 2))
    await pool.close()
    return
  }

  const majorIds = Array.from(new Set(classRows.map(r => String(r.MaNganh || '').trim()).filter(Boolean)))
  const majorReq = pool.request()
  majorIds.forEach((id, idx) => majorReq.input(`m${idx}`, sql.NVarChar(50), id))
  const majorRows = (await majorReq.query(`
    SELECT CAST(MaNganh AS NVARCHAR(50)) AS MaNganh, TenNganh, CAST(MaKhoa AS NVARCHAR(50)) AS MaKhoa
    FROM NGANH
    WHERE CAST(MaNganh AS NVARCHAR(50)) IN (${majorIds.map((_, idx) => `@m${idx}`).join(',')})
  `)).recordset || []
  const majorById = new Map(majorRows.map(r => [String(r.MaNganh), r]))

  const semesterColumns = (await pool.request().query(`
    SELECT LOWER(COLUMN_NAME) AS c
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'HOC_KY'
  `)).recordset || []
  const hasMaNganhHK = semesterColumns.some(r => String(r.c) === 'manganhhk')
  const hasTenNganhHK = semesterColumns.some(r => String(r.c) === 'tennganhhk')

  const linkNames = ((await pool.request().query(`
    SELECT TABLE_NAME
    FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_NAME IN ('HOC_KY_CAC_MON_HOC', 'HOC_KY_CAC_MON')
  `)).recordset || []).map(r => String(r.TABLE_NAME || '').trim())
  const linkTable = linkNames.includes('HOC_KY_CAC_MON_HOC') ? 'HOC_KY_CAC_MON_HOC' : (linkNames.includes('HOC_KY_CAC_MON') ? 'HOC_KY_CAC_MON' : '')
  if (!linkTable) {
    throw new Error('Missing semester-course link table')
  }

  const roomStats = (await pool.request().query(`
    SELECT
      COUNT(1) AS totalRooms,
      SUM(CASE WHEN UPPER(LTRIM(RTRIM(ISNULL(TrangThai, '')))) NOT IN (N'BẢO TRÌ', N'BAO TRI', N'KHÓA', N'KHOA', N'INACTIVE') THEN 1 ELSE 0 END) AS activeRooms,
      SUM(CASE WHEN UPPER(LTRIM(RTRIM(ISNULL(TrangThai, '')))) NOT IN (N'BẢO TRÌ', N'BAO TRI', N'KHÓA', N'KHOA', N'INACTIVE')
                AND LOWER(ISNULL(LoaiPhong,'')) LIKE N'%thực hành%' THEN 1 ELSE 0 END) AS activePracticeRooms
    FROM PHONG
  `)).recordset?.[0] || {}

  const report = []

  for (const majorId of majorIds) {
    const major = majorById.get(majorId) || {}
    const majorName = String(major.TenNganh || '').trim()
    const majorDepartmentId = String(major.MaKhoa || '').trim()

    const classes = classRows.filter(r => String(r.MaNganh) === majorId)
    const classYears = Array.from(new Set(classes.map(r => Number(r.Nam)).filter(Number.isFinite)))

    const semesterReq = pool.request().input('majorId', sql.NVarChar(50), majorId)
    const whereClauses = []
    if (hasMaNganhHK) {
      whereClauses.push(`CAST(hk.MaNganhHK AS NVARCHAR(50)) = @majorId`)
    } else if (hasTenNganhHK) {
      semesterReq.input('majorName', sql.NVarChar(255), majorName)
      whereClauses.push(`LTRIM(RTRIM(ISNULL(hk.TenNganhHK, ''))) = @majorName`)
    }
    classYears.forEach((y, idx) => semesterReq.input(`y${idx}`, sql.Int, y))
    whereClauses.push(`TRY_CONVERT(INT, hk.NamHK) IN (${classYears.map((_, idx) => `@y${idx}`).join(',')})`)

    const semesters = (await semesterReq.query(`
      SELECT hk.MaHK, hk.TenHK, TRY_CONVERT(INT, hk.NamHK) AS NamHK, hk.TuNgay, hk.DenNgay
      FROM HOC_KY hk
      WHERE (${whereClauses.join(' AND ')})
        AND ${ONGOING_STATUS_SQL}
      ORDER BY hk.MaHK
    `)).recordset || []

    const semesterIds = semesters.map(s => Number(s.MaHK)).filter(Number.isFinite)
    if (!semesterIds.length) {
      report.push({ majorId, majorName, note: 'no-ongoing-semesters', classes: classes.map(c => c.TenLop) })
      continue
    }

    const courseReq = pool.request().input('majorId', sql.NVarChar(50), majorId)
    semesterIds.forEach((id, idx) => courseReq.input(`hk${idx}`, sql.Int, id))
    const sourceCourseRows = (await courseReq.query(`
      SELECT hkm.MaHK, m.MaMon, m.TenMon, m.SoTiet, m.LoaiMon
      FROM ${linkTable} hkm
      INNER JOIN MON m ON m.MaMon = hkm.MaMon
      WHERE hkm.MaHK IN (${semesterIds.map((_, idx) => `@hk${idx}`).join(',')})
        AND CAST(m.MaNganh AS NVARCHAR(50)) = @majorId
      ORDER BY hkm.MaHK, m.MaMon
    `)).recordset || []

    const courses = sourceCourseRows.filter(r => !isExcludedFromScheduleCourse(r.TenMon))

    const expertReq = pool.request()
      .input('majorId', sql.NVarChar(50), majorId)
      .input('majorDepartmentId', sql.NVarChar(50), majorDepartmentId)

    const expertRows = (await expertReq.query(`
      SELECT cm.MaMon, COUNT(DISTINCT cm.MaGV) AS ExpertCount
      FROM CHUYEN_MON_CUA_GV cm
      INNER JOIN MON m ON m.MaMon = cm.MaMon
      INNER JOIN GIANG_VIEN gv ON gv.MaGV = cm.MaGV
      WHERE CAST(m.MaNganh AS NVARCHAR(50)) = @majorId
        AND (@majorDepartmentId = '' OR CAST(gv.MaKhoa AS NVARCHAR(50)) = @majorDepartmentId)
        AND UPPER(LTRIM(RTRIM(ISNULL(gv.TrangThai, '')))) IN (
          N'CÓ THỂ DẠY', N'CO THE DAY',
          N'ACTIVE', N'HOẠT ĐỘNG', N'HOAT DONG', N'ĐANG DẠY', N'DANG DAY', N''
        )
        AND UPPER(LTRIM(RTRIM(ISNULL(gv.TrangThai, '')))) NOT IN (
          N'TẠM DỪNG', N'TAM DUNG', N'TẠM NGƯNG', N'TAM NGUNG', N'VÔ HIỆU HÓA', N'VO HIEU HOA'
        )
      GROUP BY cm.MaMon
    `)).recordset || []

    const expertByMon = new Map(expertRows.map(r => [Number(r.MaMon), Number(r.ExpertCount || 0)]))

    const coursesBySemester = new Map()
    for (const c of courses) {
      const k = Number(c.MaHK)
      if (!coursesBySemester.has(k)) coursesBySemester.set(k, [])
      coursesBySemester.get(k).push(c)
    }

    const classMissingDetails = []
    for (const cls of classes) {
      const year = Number(cls.Nam)
      const matchedSemesters = semesters.filter(s => Number(s.NamHK) === year)
      for (const sem of matchedSemesters) {
        const semCourses = coursesBySemester.get(Number(sem.MaHK)) || []
        classMissingDetails.push({
          className: String(cls.TenLop),
          classYear: year,
          semesterId: Number(sem.MaHK),
          semesterName: String(sem.TenHK || ''),
          missingCount: semCourses.length,
          missingCourses: semCourses.map(c => ({
            maMon: Number(c.MaMon),
            tenMon: String(c.TenMon || '').trim(),
            loaiMon: String(c.LoaiMon || '').trim(),
            soTiet: Number(c.SoTiet || 0),
            isPractice: isPracticeCourseType(c.LoaiMon, c.TenMon),
            expertCount: expertByMon.get(Number(c.MaMon)) || 0,
          })),
        })
      }
    }

    const bottlenecks = []
    const seen = new Set()
    for (const d of classMissingDetails) {
      for (const c of d.missingCourses) {
        const key = String(c.maMon)
        if (seen.has(key)) continue
        seen.add(key)
        if (c.expertCount === 0) bottlenecks.push(c)
      }
    }

    report.push({
      majorId,
      majorName,
      majorDepartmentId,
      classes: classes.map(c => ({ className: c.TenLop, year: c.Nam })),
      semesters: semesters.map(s => ({ maHK: s.MaHK, tenHK: s.TenHK, namHK: s.NamHK })),
      roomStats,
      classMissingDetails,
      bottlenecksNoExpert: bottlenecks,
    })
  }

  console.log(JSON.stringify({ generatedAt: new Date().toISOString(), report }, null, 2))

  await pool.close()
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
