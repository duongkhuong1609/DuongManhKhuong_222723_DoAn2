import { NextRequest, NextResponse } from "next/server"
import { createHash } from "crypto"
import { sendInstructorCredentialEmail, sendInstructorUpdateEmail } from "@/lib/credential-email"

// use mssql driver directly because legacy tables are not managed by Prisma
const sql = require('mssql');

const dbConfig = {
  server: 'localhost',
  instanceName: 'SQLEXPRESS',
  database: 'LAP_LICH_TU_DONG',
  authentication: { type: 'default', options: { userName: 'sa', password: '123456' } },
  options: { encrypt: false, trustServerCertificate: true }
};

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex")

const sanitizeUsernameBase = (value: string) => {
  const normalized = String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "")

  return normalized || "gv"
}

const DEFAULT_INSTRUCTOR_PASSWORD = "12345678"

const generateUniqueUsername = async (
  executor: any,
  baseValue: string,
  excludeAccountId?: number | null,
) => {
  const base = sanitizeUsernameBase(baseValue).slice(0, 16)
  let suffix = 0

  while (true) {
    const candidate = `${base}${suffix === 0 ? "" : suffix}`
    const req = executor.request().input("candidate", candidate)

    let query = `
      SELECT TOP 1 MaTK
      FROM TAI_KHOAN
      WHERE TenTK = @candidate
    `

    if (Number.isFinite(Number(excludeAccountId)) && Number(excludeAccountId) > 0) {
      req.input("excludeAccountId", sql.Int, Number(excludeAccountId))
      query += ` AND MaTK <> @excludeAccountId`
    }

    const exists = await req.query(query)
    if (!exists.recordset.length) {
      return candidate
    }

    suffix += 1
  }
}

const ensureUniqueInstructorEmail = async (executor: any, email: string, excludeCode?: string | number) => {
  const requestDuplicateEmail = executor
    .request()
    .input("email", email)

  if (excludeCode) {
    requestDuplicateEmail.input("code", excludeCode)
  }

  const duplicateEmail = await requestDuplicateEmail.query(`
    SELECT TOP 1 MaGV
    FROM GIANG_VIEN
    WHERE EmailGV = @email
      ${excludeCode ? "AND MaGV <> @code" : ""}
  `)

  if (duplicateEmail.recordset.length > 0) {
    return false
  }

  const accountEmailReq = executor
    .request()
    .input("email", email)

  if (excludeCode) {
    accountEmailReq.input("code", excludeCode)
  }

  const duplicateAccountEmail = await accountEmailReq.query(`
    SELECT TOP 1 tk.MaTK
    FROM TAI_KHOAN tk
    LEFT JOIN GIANG_VIEN gv ON gv.MaTK = tk.MaTK OR gv.MaGV = tk.MaGV
    WHERE tk.EmailTK = @email
      ${excludeCode ? "AND (gv.MaGV IS NULL OR gv.MaGV <> @code)" : ""}
  `)

  return duplicateAccountEmail.recordset.length === 0
}

const createAccountSkeleton = async (
  executor: any,
  email: string,
  name: string,
  instructorCode: number | null,
) => {
  const usernameBase = String(email || "").split("@")[0] || name
  const username = await generateUniqueUsername(executor, usernameBase)
  const plainPassword = DEFAULT_INSTRUCTOR_PASSWORD
  const passwordHash = sha256(plainPassword)

  const accountInsert = await executor
    .request()
    .input("maGV", instructorCode)
    .input("username", username)
    .input("passwordHash", passwordHash)
    .input("email", email)
    .query(`
      INSERT INTO TAI_KHOAN (MaGV, TenTK, MatKhau, EmailTK, Quyen)
      OUTPUT INSERTED.MaTK
      VALUES (@maGV, @username, @passwordHash, @email, 'user')
    `)

  const accountId = Number(accountInsert.recordset?.[0]?.MaTK)

  return {
    accountId,
    username,
    plainPassword,
  }
}

const normalizeCourseIds = (value: unknown): number[] => {
  if (!Array.isArray(value)) return []
  return Array.from(
    new Set(
      value
        .map((item) => Number(item))
        .filter((item) => Number.isFinite(item) && item > 0)
    )
  )
}

const MIN_RESPONSIBLE_COURSES = 3
const MAX_RESPONSIBLE_COURSES = 5

const normalizeStatusValue = (value: string) => {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
}

const isPausedStatus = (value: string) => {
  const normalized = normalizeStatusValue(value)
  return normalized === "tam dung"
}

const normalizeInstructorStatus = (value: string) => {
  const normalized = normalizeStatusValue(value)
  if (normalized === "co the day") return "Có thể dạy"
  if (normalized === "tam dung") return "Tạm dừng"
  if (normalized === "vo hieu hoa") return "Vô hiệu hóa"
  return ""
}

const getScheduleCountByInstructor = async (executor: any, instructorCode: string | number) => {
  const result = await executor
    .request()
    .input("code", instructorCode)
    .query(`SELECT COUNT(1) AS cnt FROM LICH_DAY WHERE MaGV = @code`)

  return Number(result.recordset?.[0]?.cnt || 0)
}

const getActiveScheduleCountByInstructor = async (executor: any, instructorCode: string | number) => {
  const result = await executor
    .request()
    .input("code", instructorCode)
    .query(`
      WITH S AS (
        SELECT
          hk.MaHK,
          hk.TuNgay,
          hk.DenNgay,
          UPPER(LTRIM(RTRIM(ISNULL(CAST(hk.TrangThai AS NVARCHAR(50)), '')))) AS StatusUpper,
          COALESCE(
            TRY_CONVERT(INT, hk.TenHK),
            TRY_CONVERT(
              INT,
              CASE
                WHEN PATINDEX('%[0-9]%', CAST(hk.TenHK AS NVARCHAR(50))) > 0
                THEN SUBSTRING(
                  CAST(hk.TenHK AS NVARCHAR(50)),
                  PATINDEX('%[0-9]%', CAST(hk.TenHK AS NVARCHAR(50))),
                  10
                )
                ELSE NULL
              END
            )
          ) AS SemesterNo
        FROM HOC_KY hk
      ),
      L AS (
        SELECT
          ld.MaLD,
          ld.NgayDay,
          UPPER(LTRIM(RTRIM(ISNULL(CAST(ld.TrangThai AS NVARCHAR(50)), '')))) AS LessonStatusUpper,
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
          ) AS SemesterNo
        FROM LICH_DAY ld
        WHERE ld.MaGV = @code
      )
      SELECT COUNT(DISTINCT l.MaLD) AS cnt
      FROM L l
      LEFT JOIN S s
        ON (
          (l.SemesterNo IS NOT NULL AND s.SemesterNo IS NOT NULL AND l.SemesterNo = s.SemesterNo)
          OR (l.NgayDay IS NOT NULL AND s.TuNgay IS NOT NULL AND s.DenNgay IS NOT NULL AND l.NgayDay BETWEEN s.TuNgay AND s.DenNgay)
        )
      WHERE l.LessonStatusUpper NOT IN (
        N'ĐÃ XÓA', N'DA XOA', N'DELETED', N'HỦY', N'HUY', N'CANCELLED', N'CANCELED'
      )
        AND (
          (
            s.MaHK IS NOT NULL
            AND (
              s.StatusUpper IN (N'ĐANG DIỄN RA', N'DANG DIEN RA', N'2', N'ONGOING', N'ACTIVE')
              OR (s.DenNgay IS NOT NULL AND CAST(s.DenNgay AS DATE) >= CAST(GETDATE() AS DATE))
            )
          )
          OR (
            s.MaHK IS NULL
            AND l.NgayDay IS NOT NULL
            AND CAST(l.NgayDay AS DATE) >= CAST(GETDATE() AS DATE)
          )
        )
    `)

  return Number(result.recordset?.[0]?.cnt || 0)
}

const hasTable = async (executor: any, tableName: string) => {
  const result = await executor
    .request()
    .input("tableName", tableName)
    .query(`
      SELECT 1 AS hasTable
      WHERE OBJECT_ID(@tableName, 'U') IS NOT NULL
    `)

  return result.recordset.length > 0
}

const hasColumn = async (executor: any, tableName: string, columnName: string) => {
  const result = await executor
    .request()
    .input("tableName", tableName)
    .input("columnName", columnName)
    .query(`
      SELECT 1 AS hasCol
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = @tableName AND COLUMN_NAME = @columnName
    `)

  return result.recordset.length > 0
}

const syncInstructorCourses = async (pool: any, instructorCode: string | number, courseIds: number[]) => {
  await pool
    .request()
    .input("instructorCode", instructorCode)
    .query(`DELETE FROM CHUYEN_MON_CUA_GV WHERE MaGV = @instructorCode`)

  for (const courseId of courseIds) {
    await pool
      .request()
      .input("instructorCode", instructorCode)
      .input("courseId", sql.Int, courseId)
      .query(`
        INSERT INTO CHUYEN_MON_CUA_GV (MaGV, MaMon)
        VALUES (@instructorCode, @courseId)
      `)
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const department = searchParams.get("department")
    const status = searchParams.get("status")
    const search = searchParams.get("search")

    let pool
    try {
      pool = await sql.connect(dbConfig)
    } catch (connErr) {
      console.error("Instructor API connection error:", connErr)
      // return empty list instead of bubbling error
      return NextResponse.json({ success: true, data: [] })
    }

    let query = `
      SELECT gi.MaGV AS code,
             gi.TenGV AS name,
             gi.EmailGV AS email,
             gi.ChucVu AS position,
             k.TenKhoa AS department,
             gi.TrangThai AS status
      FROM GIANG_VIEN gi
      LEFT JOIN KHOA k ON gi.MaKhoa = k.MaKhoa
    `
    const conditions: string[] = []
    const params: Record<string, any> = {}

    if (department) {
      conditions.push("k.TenKhoa = @dept")
      params.dept = department
    }
    if (status) {
      conditions.push("gi.TrangThai = @stat")
      params.stat = status
    }
    if (search) {
      conditions.push("(gi.TenGV LIKE @search OR gi.MaGV LIKE @search OR gi.EmailGV LIKE @search)")
      params.search = `%${search}%`
    }

    conditions.push("UPPER(LTRIM(RTRIM(ISNULL(CAST(gi.TrangThai AS NVARCHAR(50)), '')))) NOT IN (N'ĐÃ XÓA', N'DA XOA', N'DELETED')")

    if (conditions.length) {
      query += " WHERE " + conditions.join(" AND ")
    }
    query += " ORDER BY gi.TenGV ASC"

    const requestDb = pool.request()
    for (const key of Object.keys(params)) {
      requestDb.input(key, params[key])
    }

    const result = await requestDb.query(query)
    await pool.close()

    return NextResponse.json({ success: true, data: result.recordset })
  } catch (error) {
    console.error("Error fetching instructors via mssql:", error)
    // on unexpected failure return empty array
    return NextResponse.json({ success: true, data: [] })
  }
}

// other methods not supported for now
export async function POST(request: NextRequest) {
  let pool: any = null
  let transaction: any = null
  try {
    const body = await request.json()
    const name = String(body.name || "").trim()
    const email = String(body.email || "").trim()
    const position = String(body.position || "").trim()
    const status = normalizeInstructorStatus(String(body.status || ""))
    const department = String(body.department || "").trim()
    const majorId = String(body.majorId || "").trim()
    const responsibleCourseIds = normalizeCourseIds(body.responsibleCourseIds)

    if (responsibleCourseIds.length < MIN_RESPONSIBLE_COURSES || responsibleCourseIds.length > MAX_RESPONSIBLE_COURSES) {
      return NextResponse.json(
        { success: false, error: `Giảng viên phải có từ ${MIN_RESPONSIBLE_COURSES} đến ${MAX_RESPONSIBLE_COURSES} môn phụ trách` },
        { status: 400 }
      )
    }

    if (!status) {
      return NextResponse.json(
        { success: false, error: "Trạng thái chỉ chấp nhận: Có thể dạy, Tạm dừng hoặc Vô hiệu hóa" },
        { status: 400 }
      )
    }

    if (!name || !email || !position || !department) {
      return NextResponse.json({ success: false, error: "Thiếu thông tin bắt buộc" }, { status: 400 })
    }

    pool = await new sql.ConnectionPool(dbConfig).connect()
    transaction = new sql.Transaction(pool)
    await transaction.begin()

    const duplicateNameEmail = await transaction
      .request()
      .input("name", name)
      .input("email", email)
      .query(`
        SELECT TOP 1 MaGV
        FROM GIANG_VIEN
        WHERE TenGV = @name AND EmailGV = @email
      `)

    if (duplicateNameEmail.recordset.length > 0) {
      await transaction.rollback()
      return NextResponse.json({ success: false, error: "Trùng cả họ tên và email giảng viên" }, { status: 400 })
    }

    const emailAvailable = await ensureUniqueInstructorEmail(transaction, email)
    if (!emailAvailable) {
      await transaction.rollback()
      return NextResponse.json({ success: false, error: "Email giảng viên đã tồn tại" }, { status: 400 })
    }

    const deptResult = await transaction
      .request()
      .input("department", department)
      .query(`
        SELECT TOP 1 MaKhoa
        FROM KHOA
        WHERE TenKhoa = @department
      `)

    if (!deptResult.recordset.length) {
      await transaction.rollback()
      return NextResponse.json({ success: false, error: "Không tìm thấy khoa/bộ môn tương ứng" }, { status: 400 })
    }

    const maKhoa = deptResult.recordset[0].MaKhoa

    if (majorId) {
      const majorResult = await transaction
        .request()
        .input("majorId", majorId)
        .input("maKhoa", maKhoa)
        .query(`
          SELECT TOP 1 MaNganh
          FROM NGANH
          WHERE CAST(MaNganh AS NVARCHAR(50)) = @majorId
            AND MaKhoa = @maKhoa
        `)

      if (!majorResult.recordset.length) {
        await transaction.rollback()
        return NextResponse.json({ success: false, error: "Ngành không thuộc khoa/bộ môn đã chọn" }, { status: 400 })
      }
    }

    if (!majorId) {
      await transaction.rollback()
      return NextResponse.json({ success: false, error: "Vui lòng chọn ngành khi thêm môn phụ trách" }, { status: 400 })
    }

    const requestCourseValidation = transaction
      .request()
      .input("majorId", majorId)
      .input("maKhoa", maKhoa)

    const placeholders = responsibleCourseIds.map((_, index) => `@courseId${index}`)
    responsibleCourseIds.forEach((courseId, index) => {
      requestCourseValidation.input(`courseId${index}`, sql.Int, courseId)
    })

    const courseValidationResult = await requestCourseValidation.query(`
      SELECT COUNT(1) AS validCount
      FROM MON m
      INNER JOIN NGANH n ON n.MaNganh = m.MaNganh
      WHERE CAST(m.MaNganh AS NVARCHAR(50)) = @majorId
        AND CAST(n.MaKhoa AS NVARCHAR(50)) = CAST(@maKhoa AS NVARCHAR(50))
        AND m.MaMon IN (${placeholders.join(",")})
    `)

    const validCount = Number(courseValidationResult.recordset?.[0]?.validCount || 0)
    if (validCount !== responsibleCourseIds.length) {
      await transaction.rollback()
      return NextResponse.json({ success: false, error: "Danh sách môn phụ trách không hợp lệ theo ngành/khoa đã chọn" }, { status: 400 })
    }

    const maTkColResult = await transaction.request().query(`
      SELECT 1 AS hasCol
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'GIANG_VIEN' AND COLUMN_NAME = 'MaTK'
    `)

    const hasMaTK = maTkColResult.recordset.length > 0

    const accountSeed = await createAccountSkeleton(transaction, email, name, null)

    const insertSql = hasMaTK
      ? `
        INSERT INTO GIANG_VIEN (TenGV, EmailGV, ChucVu, TrangThai, MaKhoa, MaTK)
        OUTPUT INSERTED.MaGV
        VALUES (@name, @email, @position, @status, @maKhoa, @maTK)
      `
      : `
        INSERT INTO GIANG_VIEN (TenGV, EmailGV, ChucVu, TrangThai, MaKhoa)
        OUTPUT INSERTED.MaGV
        VALUES (@name, @email, @position, @status, @maKhoa)
      `

    const insertResult = await transaction
      .request()
      .input("name", name)
      .input("email", email)
      .input("position", position)
      .input("status", status)
      .input("maKhoa", maKhoa)
      .input("maTK", sql.Int, accountSeed.accountId)
      .query(insertSql)

    const insertedCode = Number(insertResult.recordset?.[0]?.MaGV || 0)

    if (insertedCode) {
      await transaction
        .request()
        .input("maGV", sql.Int, insertedCode)
        .input("maTK", sql.Int, accountSeed.accountId)
        .query(`
          UPDATE TAI_KHOAN
          SET MaGV = @maGV
          WHERE MaTK = @maTK
        `)

      await syncInstructorCourses(transaction, insertedCode, responsibleCourseIds)
    }

    await transaction.commit()

    const emailResult = await sendInstructorCredentialEmail({
      recipientEmail: email,
      instructorName: name,
      username: accountSeed.username,
      password: accountSeed.plainPassword,
      instructorEmail: email,
    })

    return NextResponse.json(
      {
        success: true,
        data: {
          code: insertedCode,
          account: {
            username: accountSeed.username,
            password: accountSeed.plainPassword,
            email,
            passwordHashAlgorithm: "sha256",
            notification: emailResult.sent
              ? `Đã gửi thông tin tài khoản tới email ${email}`
              : `Đã tạo tài khoản, chưa gửi được email: ${emailResult.reason || "Lỗi không xác định"}`,
            emailSent: emailResult.sent,
          },
        },
      },
      { status: 201 }
    )
  } catch (error) {
    if (transaction) {
      try {
        await transaction.rollback()
      } catch {
        // ignore rollback failure
      }
    }
    console.error("Error creating instructor via mssql:", error)
    return NextResponse.json({ success: false, error: "Lỗi khi thêm giảng viên" }, { status: 500 })
  } finally {
    if (pool) {
      await pool.close()
    }
  }
}
export async function PUT(request: NextRequest) {
  let pool: any = null
  let transaction: any = null
  try {
    const body = await request.json()
    const specializationOnly = body.specializationOnly === true
    const code = body.code
    const name = String(body.name || "").trim()
    const email = String(body.email || "").trim()
    const position = String(body.position || "").trim()
    const status = normalizeInstructorStatus(String(body.status || ""))
    const department = String(body.department || "").trim()
    const majorId = String(body.majorId || "").trim()
    const responsibleCourseIds = normalizeCourseIds(body.responsibleCourseIds)
    const shouldUpdateProfile = !specializationOnly

    if (responsibleCourseIds.length < MIN_RESPONSIBLE_COURSES || responsibleCourseIds.length > MAX_RESPONSIBLE_COURSES) {
      return NextResponse.json(
        { success: false, error: `Giảng viên phải có từ ${MIN_RESPONSIBLE_COURSES} đến ${MAX_RESPONSIBLE_COURSES} môn phụ trách` },
        { status: 400 }
      )
    }

    if (!code) {
      return NextResponse.json({ success: false, error: "Thiếu thông tin cập nhật" }, { status: 400 })
    }

    if (shouldUpdateProfile && !status) {
      return NextResponse.json(
        { success: false, error: "Trạng thái chỉ chấp nhận: Có thể dạy, Tạm dừng hoặc Vô hiệu hóa" },
        { status: 400 }
      )
    }

    if (shouldUpdateProfile && (!name || !email || !position || !department)) {
      return NextResponse.json({ success: false, error: "Thiếu thông tin cập nhật" }, { status: 400 })
    }

    pool = await new sql.ConnectionPool(dbConfig).connect()
    transaction = new sql.Transaction(pool)
    await transaction.begin()

    const existingInstructorResult = await transaction
      .request()
      .input("code", code)
      .query(`
        SELECT TOP 1
          gi.MaGV,
          gi.TenGV,
          gi.EmailGV,
          gi.ChucVu,
          gi.TrangThai,
          gi.MaKhoa,
          k.TenKhoa AS TenKhoa
        FROM GIANG_VIEN gi
        LEFT JOIN KHOA k ON k.MaKhoa = gi.MaKhoa
        WHERE gi.MaGV = @code
      `)

    if (!existingInstructorResult.recordset.length) {
      await transaction.rollback()
      return NextResponse.json({ success: false, error: "Không tìm thấy giảng viên để cập nhật" }, { status: 404 })
    }

    const existingInstructor = existingInstructorResult.recordset[0]
    const oldStatus = String(existingInstructor?.TrangThai || "")
    let maKhoa = existingInstructor?.MaKhoa
    let effectiveName = String(existingInstructor?.TenGV || "")
    let effectiveEmail = String(existingInstructor?.EmailGV || "")
    let effectivePosition = String(existingInstructor?.ChucVu || "")
    let effectiveStatus = oldStatus
    let effectiveDepartment = String(existingInstructor?.TenKhoa || "")

    if (shouldUpdateProfile) {
      const existingEmail = String(existingInstructor?.EmailGV || "").trim().toLowerCase()
      const nextEmail = String(email || "").trim().toLowerCase()
      const emailChanged = existingEmail !== nextEmail

      if (emailChanged) {
        const duplicateNameEmail = await transaction
          .request()
          .input("code", code)
          .input("name", name)
          .input("email", email)
          .query(`
            SELECT TOP 1 MaGV
            FROM GIANG_VIEN
            WHERE TenGV = @name AND EmailGV = @email AND MaGV <> @code
          `)

        if (duplicateNameEmail.recordset.length > 0) {
          await transaction.rollback()
          return NextResponse.json({ success: false, error: "Trùng cả họ tên và email giảng viên" }, { status: 400 })
        }

        const emailAvailable = await ensureUniqueInstructorEmail(transaction, email, code)
        if (!emailAvailable) {
          await transaction.rollback()
          return NextResponse.json({ success: false, error: "Email giảng viên đã tồn tại" }, { status: 400 })
        }
      }

      const deptResult = await transaction
        .request()
        .input("department", department)
        .query(`
          SELECT TOP 1 MaKhoa
          FROM KHOA
          WHERE TenKhoa = @department
        `)

      if (!deptResult.recordset.length) {
        await transaction.rollback()
        return NextResponse.json({ success: false, error: "Không tìm thấy khoa/bộ môn tương ứng" }, { status: 400 })
      }

      maKhoa = deptResult.recordset[0].MaKhoa
      effectiveName = name
      effectiveEmail = email
      effectivePosition = position
      effectiveStatus = status
      effectiveDepartment = department
    }

    if (!maKhoa) {
      await transaction.rollback()
      return NextResponse.json({ success: false, error: "Không tìm thấy khoa/bộ môn của giảng viên" }, { status: 400 })
    }

    if (majorId) {
      const majorResult = await transaction
        .request()
        .input("majorId", majorId)
        .input("maKhoa", maKhoa)
        .query(`
          SELECT TOP 1 MaNganh
          FROM NGANH
          WHERE CAST(MaNganh AS NVARCHAR(50)) = @majorId
            AND MaKhoa = @maKhoa
        `)

      if (!majorResult.recordset.length) {
        await transaction.rollback()
        return NextResponse.json({ success: false, error: "Ngành không thuộc khoa/bộ môn đã chọn" }, { status: 400 })
      }
    }

    if (!majorId) {
      await transaction.rollback()
      return NextResponse.json({ success: false, error: "Vui lòng chọn ngành khi thêm môn phụ trách" }, { status: 400 })
    }

    const requestCourseValidation = transaction
      .request()
      .input("majorId", majorId)
      .input("maKhoa", maKhoa)

    const placeholders = responsibleCourseIds.map((_, index) => `@courseId${index}`)
    responsibleCourseIds.forEach((courseId, index) => {
      requestCourseValidation.input(`courseId${index}`, sql.Int, courseId)
    })

    const courseValidationResult = await requestCourseValidation.query(`
      SELECT COUNT(1) AS validCount
      FROM MON m
      INNER JOIN NGANH n ON n.MaNganh = m.MaNganh
      WHERE CAST(m.MaNganh AS NVARCHAR(50)) = @majorId
        AND CAST(n.MaKhoa AS NVARCHAR(50)) = CAST(@maKhoa AS NVARCHAR(50))
        AND m.MaMon IN (${placeholders.join(",")})
    `)

    const validCount = Number(courseValidationResult.recordset?.[0]?.validCount || 0)
    if (validCount !== responsibleCourseIds.length) {
      await transaction.rollback()
      return NextResponse.json({ success: false, error: "Danh sách môn phụ trách không hợp lệ theo ngành/khoa đã chọn" }, { status: 400 })
    }

    if (shouldUpdateProfile) {
      const updateResult = await transaction
        .request()
        .input("code", code)
        .input("name", name)
        .input("email", email)
        .input("position", position)
        .input("status", status)
        .input("maKhoa", maKhoa)
        .query(`
          UPDATE GIANG_VIEN
          SET TenGV = @name,
              EmailGV = @email,
              ChucVu = @position,
              TrangThai = @status,
              MaKhoa = @maKhoa
          WHERE MaGV = @code
        `)

      if (!isPausedStatus(oldStatus) && isPausedStatus(status)) {
        const scheduleCount = await getScheduleCountByInstructor(transaction, code)
        if (scheduleCount > 0) {
          await transaction.rollback()
          return NextResponse.json(
            {
              success: false,
              error: "Không thể chuyển giảng viên sang trạng thái Tạm dừng vì đang có lịch dạy.",
            },
            { status: 400 }
          )
        }
      }

      if (!updateResult.rowsAffected || updateResult.rowsAffected[0] === 0) {
        await transaction.rollback()
        return NextResponse.json({ success: false, error: "Không tìm thấy giảng viên để cập nhật" }, { status: 404 })
      }
    }

    await syncInstructorCourses(transaction, code, responsibleCourseIds)

    await transaction.commit()

    // Send update notification email (non-blocking, ignore failure)
    if (shouldUpdateProfile) {
      sendInstructorUpdateEmail({
        recipientEmail: effectiveEmail,
        instructorName: effectiveName,
        position: effectivePosition,
        status: effectiveStatus,
        department: effectiveDepartment,
      }).catch((err) => console.warn("Update email send warning:", err))
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    if (transaction) {
      try {
        await transaction.rollback()
      } catch {
        // ignore rollback failure
      }
    }
    console.error("Error updating instructor via mssql:", error)
    return NextResponse.json({ success: false, error: "Lỗi khi cập nhật giảng viên" }, { status: 500 })
  } finally {
    if (pool) {
      await pool.close()
    }
  }
}
export async function DELETE(request: NextRequest) {
  let pool: any = null
  let transaction: any = null
  try {
    const body = await request.json()
    const code = body.code

    if (!code) {
      return NextResponse.json({ success: false, error: "Thiếu mã giảng viên để xóa" }, { status: 400 })
    }

    pool = await new sql.ConnectionPool(dbConfig).connect()
    transaction = new sql.Transaction(pool)
    await transaction.begin()

    const existed = await transaction
      .request()
      .input("code", code)
      .query(`SELECT TOP 1 MaGV, TrangThai FROM GIANG_VIEN WHERE MaGV = @code`)

    if (!existed.recordset.length) {
      await transaction.rollback()
      return NextResponse.json({ success: false, error: "Không tìm thấy giảng viên để xóa" }, { status: 404 })
    }

    const currentStatus = String(existed.recordset?.[0]?.TrangThai || "")
    if (!isPausedStatus(currentStatus)) {
      await transaction.rollback()
      return NextResponse.json(
        {
          success: false,
          error: "Chỉ được xóa giảng viên khi trạng thái là Tạm dừng.",
        },
        { status: 400 }
      )
    }

    const activeScheduleCount = await getActiveScheduleCountByInstructor(transaction, code)
    if (activeScheduleCount > 0) {
      await transaction.rollback()
      return NextResponse.json(
        {
          success: false,
          error: "Không thể xóa giảng viên vì vẫn còn lịch dạy của học kỳ chưa kết thúc/đang diễn ra.",
        },
        { status: 400 }
      )
    }

    const disableResult = await transaction
      .request()
      .input("code", code)
      .query(`
        UPDATE GIANG_VIEN
        SET TrangThai = N'Vô hiệu hóa'
        WHERE MaGV = @code
      `)

    await transaction.commit()

    if (!disableResult.rowsAffected || disableResult.rowsAffected[0] === 0) {
      return NextResponse.json({ success: false, error: "Không tìm thấy giảng viên để xóa" }, { status: 404 })
    }

    return NextResponse.json({ success: true, data: { disabled: true } })
  } catch (error: any) {
    if (transaction) {
      try {
        await transaction.rollback()
      } catch {
        // ignore rollback failure
      }
    }

    console.error("Error deleting instructor via mssql:", error)

    if (Number(error?.number) === 547) {
      return NextResponse.json(
        {
          success: false,
          error: "Không thể vô hiệu hóa giảng viên do còn dữ liệu ràng buộc.",
        },
        { status: 400 }
      )
    }

    return NextResponse.json({ success: false, error: "Lỗi khi xóa giảng viên" }, { status: 500 })
  } finally {
    if (pool) {
      await pool.close()
    }
  }
}
