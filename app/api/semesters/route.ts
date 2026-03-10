import { NextRequest, NextResponse } from "next/server"
// use mssql driver directly to query database without Prisma
const sql = require('mssql');

const dbConfig = {
  server: 'localhost',
  instanceName: 'SQLEXPRESS',
  database: 'LAP_LICH_TU_DONG',
  authentication: { type: 'default', options: { userName: 'sa', password: '123456' } },
  options: { encrypt: false, trustServerCertificate: true }
};

const createDbPool = async () => {
  const pool = new sql.ConnectionPool(dbConfig)
  await pool.connect()
  return pool
}

const parseDateValue = (value: unknown) => {
  const raw = String(value || '').trim()
  if (!raw) return null

  const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/
  const date = dateOnlyPattern.test(raw)
    ? new Date(`${raw}T00:00:00`)
    : new Date(raw)

  return Number.isNaN(date.getTime()) ? null : date
}

const buildNumericExtractExpression = (tableAlias: string, columnName: string) => `
  COALESCE(
    TRY_CONVERT(INT, ${tableAlias}.${columnName}),
    TRY_CONVERT(
      INT,
      CASE
        WHEN PATINDEX('%[0-9]%', CAST(${tableAlias}.${columnName} AS NVARCHAR(50))) > 0
        THEN SUBSTRING(
          CAST(${tableAlias}.${columnName} AS NVARCHAR(50)),
          PATINDEX('%[0-9]%', CAST(${tableAlias}.${columnName} AS NVARCHAR(50))),
          10
        )
        ELSE NULL
      END
    )
  )
`

const getTableColumns = async (pool: any, tableName: string) => {
  const result = await pool
    .request()
    .input('tableName', tableName)
    .query(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = @tableName
    `)

  return new Set(
    result.recordset.map((row: any) => String(row.COLUMN_NAME || '').trim())
  )
}

const resolveLinkTable = async (pool: any) => {
  const result = await pool.request().query(`
    SELECT TABLE_NAME
    FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_NAME IN ('HOC_KY_CAC_MON_HOC', 'HOC_KY_CAC_MON')
  `)

  const names = result.recordset.map((row: any) => String(row.TABLE_NAME || '').trim())
  if (names.includes('HOC_KY_CAC_MON_HOC')) return 'HOC_KY_CAC_MON_HOC'
  if (names.includes('HOC_KY_CAC_MON')) return 'HOC_KY_CAC_MON'
  return ''
}

const resolveAcademicYearLabel = (dateLike: unknown) => {
  const now = new Date()
  const currentLabel = now.getMonth() >= 7
    ? `${now.getFullYear()}-${now.getFullYear() + 1}`
    : `${now.getFullYear() - 1}-${now.getFullYear()}`

  const date = new Date(String(dateLike || ''))
  if (Number.isNaN(date.getTime())) return currentLabel

  const y = date.getFullYear()
  return date.getMonth() >= 7 ? `${y}-${y + 1}` : `${y - 1}-${y}`
}

const resolveCourseSemesterNumber = (classYear: number, semesterNumber: number) => {
  const mapping: Record<string, number> = {
    '1-1': 1,
    '1-2': 2,
    '2-1': 3,
    '2-2': 4,
    '3-1': 5,
    '3-2': 6,
    '3-3': 7,
    '4-1': 8,
    '4-2': 9,
    '4-3': 10,
  }

  return mapping[`${classYear}-${semesterNumber}`] || 0
}

const resolveSemesterDependentTables = async (pool: any) => {
  const result = await pool.request().query(`
    SELECT DISTINCT fk.TABLE_NAME AS tableName, fk.COLUMN_NAME AS columnName
    FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS rc
    INNER JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE fk
      ON rc.CONSTRAINT_NAME = fk.CONSTRAINT_NAME
    INNER JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE pk
      ON rc.UNIQUE_CONSTRAINT_NAME = pk.CONSTRAINT_NAME
    WHERE pk.TABLE_NAME = 'HOC_KY'
  `)

  return result.recordset
    .map((row: any) => ({
      tableName: String(row.tableName || '').trim(),
      columnName: String(row.columnName || '').trim(),
    }))
    .filter((item: { tableName: string; columnName: string }) =>
      item.tableName &&
      item.columnName &&
      item.tableName !== 'HOC_KY'
    )
}

const safeSqlIdentifier = (value: string) => {
  if (!/^[A-Za-z0-9_]+$/.test(value)) return ''
  return `[${value}]`
}

const getSemesterSnapshot = async (pool: any, semesterId: string) => {
  const result = await pool
    .request()
    .input('semesterId', semesterId)
    .query(`
      SELECT TOP 1
        MaHK,
        TenHK,
        TuNgay,
        DenNgay
      FROM HOC_KY
      WHERE CAST(MaHK AS NVARCHAR(50)) = @semesterId
    `)

  return result.recordset[0]
}

const hasActiveScheduleInSemester = async (pool: any, semesterId: string) => {
  const semester = await getSemesterSnapshot(pool, semesterId)
  if (!semester) return false

  const semesterNumber = Number(String(semester.TenHK || '').trim())
  const startDate = semester.TuNgay ? new Date(semester.TuNgay) : null
  const endDate = semester.DenNgay ? new Date(semester.DenNgay) : null

  const request = pool
    .request()
    .input('semesterNumber', Number.isNaN(semesterNumber) ? -1 : semesterNumber)

  const timeConditions: string[] = []
  if (startDate && !Number.isNaN(startDate.getTime())) {
    request.input('startDate', startDate)
    timeConditions.push('ld.NgayDay >= @startDate')
  }
  if (endDate && !Number.isNaN(endDate.getTime())) {
    request.input('endDate', endDate)
    timeConditions.push('ld.NgayDay <= @endDate')
  }

  const byDateRangeCondition = timeConditions.length > 0
    ? `(${timeConditions.join(' AND ')})`
    : '1 = 0'

  const result = await request.query(`
    SELECT COUNT(1) AS scheduleCount
    FROM LICH_DAY ld
    WHERE (
      COALESCE(
        TRY_CONVERT(INT, ld.HocKyDay),
        TRY_CONVERT(
          INT,
          CASE
            WHEN PATINDEX('%[0-9]%', CAST(ld.HocKyDay AS NVARCHAR(50))) > 0
            THEN SUBSTRING(
              CAST(ld.HocKyDay AS NVARCHAR(50)),
              PATINDEX('%[0-9]%', CAST(ld.HocKyDay AS NVARCHAR(50))),
              10
            )
            ELSE NULL
          END
        )
      ) = @semesterNumber
      OR ${byDateRangeCondition}
    )
      AND UPPER(LTRIM(RTRIM(ISNULL(CAST(ld.TrangThai AS NVARCHAR(50)), '')))) NOT IN (
        N'ĐÃ XÓA', N'DA XOA', N'DELETED', N'HỦY', N'HUY', N'CANCELLED', N'CANCELED'
      )
  `)

  return Number(result.recordset?.[0]?.scheduleCount || 0) > 0
}

export async function GET(request: NextRequest) {
  let pool: any
  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get("status")

    pool = await createDbPool()

    const semesterColumns = await getTableColumns(pool, 'HOC_KY')
    const hasMajorNameColumn = semesterColumns.has('TenNganhHK')
    const hasMajorIdColumn = semesterColumns.has('MaNganhHK')
    const hasAcademicYearColumn = semesterColumns.has('NamHocHK')
    const linkTable = await resolveLinkTable(pool)

    const selectParts = [
      'hk.MaHK AS code',
      'hk.TenHK AS name',
      'hk.NamHK AS classYear',
      hasAcademicYearColumn ? 'hk.NamHocHK AS academicYear' : "'' AS academicYear",
      hasMajorNameColumn
        ? 'hk.TenNganhHK AS majorName'
        : hasMajorIdColumn
          ? 'n.TenNganh AS majorName'
          : "'' AS majorName",
      'hk.TuNgay AS startDate',
      'hk.DenNgay AS endDate',
      'hk.TrangThai AS status',
      linkTable
        ? `(SELECT COUNT(1) FROM ${linkTable} hkm WHERE hkm.MaHK = hk.MaHK) AS mappedCourseCount`
        : '0 AS mappedCourseCount',
      linkTable
        ? `(SELECT COALESCE(SUM(TRY_CONVERT(INT, m.SoTinChi)), 0)
             FROM ${linkTable} hkm
             INNER JOIN MON m ON hkm.MaMon = m.MaMon
             WHERE hkm.MaHK = hk.MaHK) AS mappedTotalCredits`
        : '0 AS mappedTotalCredits',
    ]

    let query = `
      SELECT ${selectParts.join(',\n             ')}
      FROM HOC_KY hk
      ${hasMajorIdColumn ? 'LEFT JOIN NGANH n ON hk.MaNganhHK = n.MaNganh' : ''}
    `

    const conditions: string[] = []
    const params: Record<string, any> = {}

    if (status) {
      conditions.push("TrangThai = @st")
      params.st = status
    }

    if (conditions.length) {
      query += ` WHERE ${conditions.join(' AND ')}`
    }

    query += ' ORDER BY hk.TuNgay DESC, hk.MaHK DESC'

    const requestDb = pool.request()
    for (const key of Object.keys(params)) {
      requestDb.input(key, params[key])
    }

    const result = await requestDb.query(query)

    const mapped = result.recordset.map((row: any) => ({
      _id: String(row.code || ''),
      code: String(row.code || ''),
      name: String(row.name || '').trim(),
      shortName: String(row.name || '').trim(),
      semesterNumber: Number((String(row.name || '').match(/\d+/) || [0])[0]) || 0,
      classYear: Number(row.classYear || 0),
      majorName: String(row.majorName || '').trim(),
      academicYear: String(row.academicYear || '').trim() || resolveAcademicYearLabel(row.startDate),
      startDate: row.startDate,
      endDate: row.endDate,
      isActive: true,
      isCurrent: false,
      status: String(row.status || 'upcoming').trim(),
      mappedCourseCount: Number(row.mappedCourseCount || 0),
      mappedTotalCredits: Number(row.mappedTotalCredits || 0),
    }))

    return NextResponse.json({ success: true, data: mapped })
  } catch (error) {
    console.error("Error fetching semesters via mssql:", error)
    return NextResponse.json({ success: false, error: "Lỗi khi tải danh sách học kỳ" }, { status: 500 })
  } finally {
    if (pool) {
      await pool.close()
    }
  }
}

export async function POST(request: NextRequest) {
  let pool: any
  let majorId = ''
  let majorName = ''
  let classYear = 0
  let semesterNumber = 0
  let academicYearStart = 0
  let startDate: Date | null = null
  let endDate: Date | null = null
  try {
    const body = await request.json()
    majorId = String(body.majorId || '').trim()
    majorName = String(body.majorName || '').trim()
    classYear = Number(body.classYear)
    semesterNumber = Number(body.semesterNumber)
    academicYearStart = Number(body.academicYearStart)
    startDate = parseDateValue(body.startDate)
    endDate = parseDateValue(body.endDate)
    const status = String(body.status || 'upcoming').trim() || 'upcoming'

    if (!majorId || !majorName || Number.isNaN(classYear) || Number.isNaN(semesterNumber) || Number.isNaN(academicYearStart) || !startDate || !endDate) {
      return NextResponse.json({ success: false, error: 'Thiếu thông tin bắt buộc' }, { status: 400 })
    }

    if (classYear < 1 || classYear > 4) {
      return NextResponse.json({ success: false, error: 'Năm lớp chỉ được từ 1 đến 4' }, { status: 400 })
    }

    const maxSemesterInYear = classYear <= 2 ? 2 : 3
    if (semesterNumber < 1 || semesterNumber > maxSemesterInYear) {
      return NextResponse.json({ success: false, error: `Năm ${classYear} chỉ có ${maxSemesterInYear} học kỳ` }, { status: 400 })
    }

    const currentYear = new Date().getFullYear()
    const allowedAcademicYears = [currentYear - 1, currentYear]
    if (!allowedAcademicYears.includes(academicYearStart)) {
      return NextResponse.json({ success: false, error: `Năm học chỉ được trong ${currentYear - 1}-${currentYear} hoặc ${currentYear}-${currentYear + 1}` }, { status: 400 })
    }

    if (startDate >= endDate) {
      return NextResponse.json({ success: false, error: 'Ngày bắt đầu phải nhỏ hơn ngày kết thúc' }, { status: 400 })
    }

    const startYear = startDate.getFullYear()
    const endYear = endDate.getFullYear()
    if (startYear < academicYearStart || startYear > academicYearStart + 1 || endYear < academicYearStart || endYear > academicYearStart + 1) {
      return NextResponse.json({ success: false, error: `Mốc thời gian chỉ được nằm trong năm học ${academicYearStart}-${academicYearStart + 1}` }, { status: 400 })
    }

    const durationDays = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
    const minDays = maxSemesterInYear === 2 ? 120 : 90
    const maxDays = maxSemesterInYear === 2 ? 155 : 124
    if (durationDays < minDays || durationDays > maxDays) {
      return NextResponse.json(
        {
          success: false,
          error: maxSemesterInYear === 2
            ? 'Năm có 2 học kỳ thì thời lượng phải trong khoảng 4-5 tháng'
            : 'Năm có 3 học kỳ thì thời lượng phải trong khoảng 3-4 tháng',
        },
        { status: 400 }
      )
    }

    pool = await createDbPool()

    const semesterColumns = await getTableColumns(pool, 'HOC_KY')
    const hasMajorNameColumn = semesterColumns.has('TenNganhHK')
    const hasMajorIdColumn = semesterColumns.has('MaNganhHK')
    const hasAcademicYearColumn = semesterColumns.has('NamHocHK')
    const linkTable = await resolveLinkTable(pool)

    const mappedSemesterNumber = resolveCourseSemesterNumber(classYear, semesterNumber)
    if (mappedSemesterNumber <= 0) {
      return NextResponse.json({ success: false, error: 'Không thể quy đổi học kỳ theo năm lớp' }, { status: 400 })
    }

    const semesterName = String(mappedSemesterNumber)
    const academicYearLabel = `${academicYearStart}-${academicYearStart + 1}`

    let duplicateQuery = `
      SELECT TOP 1 hk.MaHK
      FROM HOC_KY hk
      WHERE hk.TenHK = @semesterName AND CAST(hk.NamHK AS NVARCHAR(50)) = @classYear
    `
    const duplicateRequest = pool
      .request()
      .input('semesterName', semesterName)
      .input('classYear', String(classYear))

    if (hasMajorIdColumn) {
      duplicateQuery += ' AND hk.MaNganhHK = @majorId'
      duplicateRequest.input('majorId', majorId)
    } else if (hasMajorNameColumn) {
      duplicateQuery += ' AND hk.TenNganhHK = @majorName'
      duplicateRequest.input('majorName', majorName)
    }

    if (hasAcademicYearColumn) {
      duplicateQuery += ' AND hk.NamHocHK = @academicYear'
      duplicateRequest.input('academicYear', academicYearLabel)
    } else {
      duplicateQuery += ' AND YEAR(hk.TuNgay) = @startYear'
      duplicateRequest.input('startYear', sql.Int, academicYearStart)
    }

    const duplicate = await duplicateRequest.query(duplicateQuery)
    if (duplicate.recordset.length > 0) {
      return NextResponse.json({
        success: true,
        data: { id: Number(duplicate.recordset[0].MaHK || 0), alreadyExists: true },
      })
    }

    const insertColumns = ['TenHK', 'TrangThai', 'TuNgay', 'DenNgay', 'NamHK']
    const insertValues = ['@semesterName', '@status', '@startDate', '@endDate', '@classYear']

    if (hasMajorNameColumn) {
      insertColumns.push('TenNganhHK')
      insertValues.push('@majorName')
    }
    if (hasMajorIdColumn) {
      insertColumns.push('MaNganhHK')
      insertValues.push('@majorId')
    }
    if (hasAcademicYearColumn) {
      insertColumns.push('NamHocHK')
      insertValues.push('@academicYear')
    }

    const insertSemesterResult = await pool
      .request()
      .input('semesterName', semesterName)
      .input('status', status)
      .input('startDate', startDate)
      .input('endDate', endDate)
      .input('classYear', sql.Int, classYear)
      .input('majorName', majorName)
      .input('majorId', majorId)
      .input('academicYear', academicYearLabel)
      .query(`
        INSERT INTO HOC_KY (${insertColumns.join(', ')})
        OUTPUT INSERTED.MaHK AS id
        VALUES (${insertValues.join(', ')})
      `)

    const semesterId = Number(insertSemesterResult.recordset?.[0]?.id)
    if (Number.isNaN(semesterId) || semesterId <= 0) {
      return NextResponse.json({ success: false, error: 'Không thể tạo học kỳ mới' }, { status: 500 })
    }

    let mappingWarning: string | null = null

    if (linkTable) {
      const monColumns = await getTableColumns(pool, 'MON')
      const monYearColumn = monColumns.has('NamM') ? 'NamM' : monColumns.has('Nam') ? 'Nam' : ''
      const hasMonSemesterColumn = monColumns.has('HocKy')
      const mappedSemesterNumber = resolveCourseSemesterNumber(classYear, semesterNumber)

      if (monYearColumn && hasMonSemesterColumn && mappedSemesterNumber > 0) {
        const yearExpr = buildNumericExtractExpression('m', monYearColumn)
        const semesterExpr = buildNumericExtractExpression('m', 'HocKy')

        const mappingRequest = pool
          .request()
          .input('semesterId', sql.Int, semesterId)
          .input('majorId', majorId)
          .input('classYear', sql.Int, classYear)
          .input('mappedSemester', sql.Int, mappedSemesterNumber)

        try {
          await mappingRequest.query(`
              INSERT INTO ${linkTable} (MaHK, MaMon)
              SELECT @semesterId, m.MaMon
              FROM MON m
              WHERE m.MaNganh = @majorId
                AND ${yearExpr} = @classYear
                AND ${semesterExpr} = @mappedSemester
                AND NOT EXISTS (
                  SELECT 1
                  FROM ${linkTable} hkm
                  WHERE hkm.MaHK = @semesterId AND hkm.MaMon = m.MaMon
                )
            `)
        } catch (mappingError) {
          console.error('Warning mapping semester-courses via mssql:', mappingError)
          mappingWarning = 'Không thể đồng bộ đầy đủ môn học cho học kỳ, nhưng học kỳ đã được tạo.'
        }
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        id: semesterId,
        warning: mappingWarning,
      },
    }, { status: 201 })
  } catch (error) {
    console.error('Error creating semester via mssql:', error)

    if (majorName && classYear > 0 && semesterNumber > 0) {
      let recoveryPool: any
      try {
        recoveryPool = await createDbPool()
        const semesterName = `Học kỳ ${semesterNumber}`
        const mappedSemesterNumber = resolveCourseSemesterNumber(classYear, semesterNumber)
        const normalizedSemesterName = mappedSemesterNumber > 0 ? String(mappedSemesterNumber) : String(semesterNumber)
        const existing = await recoveryPool
          .request()
          .input('semesterName', normalizedSemesterName)
          .input('classYear', String(classYear))
          .input('majorName', majorName)
          .query(`
            SELECT TOP 1 MaHK
            FROM HOC_KY
            WHERE TenHK = @semesterName
              AND CAST(NamHK AS NVARCHAR(50)) = @classYear
              AND TenNganhHK = @majorName
            ORDER BY MaHK DESC
          `)

        if (existing.recordset.length > 0) {
          return NextResponse.json({
            success: true,
            data: {
              id: Number(existing.recordset[0].MaHK || 0),
              recovered: true,
            },
          })
        }
      } catch (recoveryError) {
        console.error('Error recovering create semester state:', recoveryError)
      } finally {
        if (recoveryPool) {
          await recoveryPool.close()
        }
      }
    }

    return NextResponse.json({ success: false, error: 'Lỗi khi thêm học kỳ' }, { status: 500 })
  } finally {
    if (pool) {
      await pool.close()
    }
  }
}

export async function PUT(request: NextRequest) {
  let pool: any
  try {
    const body = await request.json()
    const action = String(body.action || '').trim()
    const code = String(body._id || body.code || '').trim()
    const status = String(body.status || '').trim()

    if (!code) {
      return NextResponse.json({ success: false, error: 'Thiếu mã học kỳ' }, { status: 400 })
    }

    pool = await createDbPool()

    if (action === 'updateInfo') {
      const majorId = String(body.majorId || '').trim()
      const majorName = String(body.majorName || '').trim()
      const classYear = Number(body.classYear)
      const semesterNumber = Number(body.semesterNumber)
      const academicYearStart = Number(body.academicYearStart)
      const startDate = parseDateValue(body.startDate)
      const endDate = parseDateValue(body.endDate)
      const normalizedStatus = String(body.status || 'upcoming').trim() || 'upcoming'

      if (!majorId || !majorName || Number.isNaN(classYear) || Number.isNaN(semesterNumber) || Number.isNaN(academicYearStart) || !startDate || !endDate) {
        return NextResponse.json({ success: false, error: 'Thiếu thông tin bắt buộc để cập nhật học kỳ' }, { status: 400 })
      }

      const maxSemesterInYear = classYear <= 2 ? 2 : 3
      if (semesterNumber < 1 || semesterNumber > maxSemesterInYear) {
        return NextResponse.json({ success: false, error: `Năm ${classYear} chỉ có ${maxSemesterInYear} học kỳ` }, { status: 400 })
      }

      if (startDate >= endDate) {
        return NextResponse.json({ success: false, error: 'Ngày bắt đầu phải nhỏ hơn ngày kết thúc' }, { status: 400 })
      }

      const mappedSemesterNumber = resolveCourseSemesterNumber(classYear, semesterNumber)
      if (mappedSemesterNumber <= 0) {
        return NextResponse.json({ success: false, error: 'Không thể quy đổi học kỳ theo năm lớp' }, { status: 400 })
      }

      if (normalizedStatus === 'upcoming' || normalizedStatus === 'completed') {
        const hasActiveSchedule = await hasActiveScheduleInSemester(pool, code)
        if (hasActiveSchedule) {
          return NextResponse.json(
            { success: false, error: 'Học kỳ đang có thời khóa biểu chưa xóa nên không thể chuyển trạng thái sang Sắp tới hoặc Đã kết thúc' },
            { status: 400 }
          )
        }
      }

      const semesterColumns = await getTableColumns(pool, 'HOC_KY')
      const hasMajorNameColumn = semesterColumns.has('TenNganhHK')
      const hasMajorIdColumn = semesterColumns.has('MaNganhHK')
      const hasAcademicYearColumn = semesterColumns.has('NamHocHK')
      const academicYearLabel = `${academicYearStart}-${academicYearStart + 1}`

      const setClauses = [
        'TenHK = @semesterName',
        'TrangThai = @status',
        'TuNgay = @startDate',
        'DenNgay = @endDate',
        'NamHK = @classYear',
      ]

      if (hasMajorNameColumn) setClauses.push('TenNganhHK = @majorName')
      if (hasMajorIdColumn) setClauses.push('MaNganhHK = @majorId')
      if (hasAcademicYearColumn) setClauses.push('NamHocHK = @academicYear')

      await pool
        .request()
        .input('code', code)
        .input('semesterName', String(mappedSemesterNumber))
        .input('status', normalizedStatus)
        .input('startDate', startDate)
        .input('endDate', endDate)
        .input('classYear', String(classYear))
        .input('majorName', majorName)
        .input('majorId', majorId)
        .input('academicYear', academicYearLabel)
        .query(`
          UPDATE HOC_KY
          SET ${setClauses.join(', ')}
          WHERE CAST(MaHK AS NVARCHAR(50)) = @code
        `)

      const linkTable = await resolveLinkTable(pool)
      if (linkTable) {
        await pool
          .request()
          .input('code', code)
          .query(`DELETE FROM ${linkTable} WHERE CAST(MaHK AS NVARCHAR(50)) = @code`)

        const monColumns = await getTableColumns(pool, 'MON')
        const monYearColumn = monColumns.has('NamM') ? 'NamM' : monColumns.has('Nam') ? 'Nam' : ''
        const hasMonSemesterColumn = monColumns.has('HocKy')

        if (monYearColumn && hasMonSemesterColumn) {
          const yearExpr = buildNumericExtractExpression('m', monYearColumn)
          const semesterExpr = buildNumericExtractExpression('m', 'HocKy')

          await pool
            .request()
            .input('code', code)
            .input('majorId', majorId)
            .input('classYear', sql.Int, classYear)
            .input('mappedSemester', sql.Int, mappedSemesterNumber)
            .query(`
              INSERT INTO ${linkTable} (MaHK, MaMon)
              SELECT TRY_CONVERT(INT, @code), m.MaMon
              FROM MON m
              WHERE m.MaNganh = @majorId
                AND ${yearExpr} = @classYear
                AND ${semesterExpr} = @mappedSemester
                AND NOT EXISTS (
                  SELECT 1
                  FROM ${linkTable} hkm
                  WHERE CAST(hkm.MaHK AS NVARCHAR(50)) = @code AND hkm.MaMon = m.MaMon
                )
            `)
        }
      }

      return NextResponse.json({ success: true })
    }

    if (status) {
      if (status === 'upcoming' || status === 'completed') {
        const hasActiveSchedule = await hasActiveScheduleInSemester(pool, code)
        if (hasActiveSchedule) {
          return NextResponse.json(
            { success: false, error: 'Học kỳ đang có thời khóa biểu chưa xóa nên không thể chuyển trạng thái sang Sắp tới hoặc Đã kết thúc' },
            { status: 400 }
          )
        }
      }

      await pool
        .request()
        .input('code', code)
        .input('status', status)
        .query(`
          UPDATE HOC_KY
          SET TrangThai = @status
          WHERE CAST(MaHK AS NVARCHAR(50)) = @code
        `)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error updating semester via mssql:', error)
    return NextResponse.json({ success: false, error: 'Lỗi khi cập nhật học kỳ' }, { status: 500 })
  } finally {
    if (pool) {
      await pool.close()
    }
  }
}

export async function DELETE(request: NextRequest) {
  let pool: any
  let id = ''
  try {
    const { searchParams } = new URL(request.url)
    id = String(searchParams.get('id') || '').trim()

    if (!id) {
      return NextResponse.json({ success: false, error: 'Thiếu mã học kỳ' }, { status: 400 })
    }

    pool = await createDbPool()

    const existed = await pool
      .request()
      .input('id', id)
      .query(`SELECT TOP 1 MaHK FROM HOC_KY WHERE CAST(MaHK AS NVARCHAR(50)) = @id`)

    if (existed.recordset.length === 0) {
      return NextResponse.json({ success: true, data: { alreadyDeleted: true } })
    }

    const hasActiveSchedule = await hasActiveScheduleInSemester(pool, id)
    if (hasActiveSchedule) {
      return NextResponse.json(
        { success: false, error: 'Không thể xóa học kỳ vì vẫn còn thời khóa biểu chưa xóa trong LICH_DAY' },
        { status: 400 }
      )
    }

    const linkTable = await resolveLinkTable(pool)
    const dependents = await resolveSemesterDependentTables(pool)

    if (linkTable) {
      await pool
        .request()
        .input('id', id)
        .query(`DELETE FROM ${linkTable} WHERE CAST(MaHK AS NVARCHAR(50)) = @id`)
    }

    for (const dependent of dependents) {
      if (dependent.tableName === linkTable) continue

      const tableName = safeSqlIdentifier(dependent.tableName)
      const columnName = safeSqlIdentifier(dependent.columnName)
      if (!tableName || !columnName) continue

      try {
        await pool
          .request()
          .input('id', id)
          .query(`DELETE FROM ${tableName} WHERE CAST(${columnName} AS NVARCHAR(50)) = @id`)
      } catch (dependentError) {
        console.error(`Warning deleting dependent rows in ${dependent.tableName}:`, dependentError)
      }
    }

    const deleteResult = await pool
      .request()
      .input('id', id)
      .query(`DELETE FROM HOC_KY WHERE CAST(MaHK AS NVARCHAR(50)) = @id`)

    if (!deleteResult.rowsAffected || deleteResult.rowsAffected[0] === 0) {
      return NextResponse.json({ success: true, data: { alreadyDeleted: true } })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting semester via mssql:', error)

    if (id) {
      let recoveryPool: any
      try {
        recoveryPool = await createDbPool()
        const existing = await recoveryPool
          .request()
          .input('id', id)
          .query(`SELECT TOP 1 MaHK FROM HOC_KY WHERE CAST(MaHK AS NVARCHAR(50)) = @id`)

        if (existing.recordset.length === 0) {
          return NextResponse.json({ success: true, data: { recovered: true, alreadyDeleted: true } })
        }
      } catch (recoveryError) {
        console.error('Error recovering delete semester state:', recoveryError)
      } finally {
        if (recoveryPool) {
          await recoveryPool.close()
        }
      }
    }

    return NextResponse.json({ success: false, error: 'Lỗi khi xóa học kỳ' }, { status: 500 })
  } finally {
    if (pool) {
      await pool.close()
    }
  }
}
