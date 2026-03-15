const sql = require('mssql')

const DB_CONFIG = {
  server: 'localhost',
  instanceName: 'SQLEXPRESS',
  database: 'LAP_LICH_TU_DONG',
  authentication: {
    type: 'default',
    options: {
      userName: 'sa',
      password: '123456',
    },
  },
  options: {
    encrypt: false,
    trustServerCertificate: true,
  },
  requestTimeout: 120000,
  connectionTimeout: 30000,
}

const USER_PASSWORD_HASH = 'EF797C8118F02DFB649607DD5D3F8C7623048C9C063D532CC95C5ED7A898A64F'

const MAJOR_CONFIGS = [
  {
    majorId: 1,
    emailPrefix: 'cntt',
    names: [
      'Nguyen Minh An',
      'Tran Quoc Bao',
      'Le Gia Huy',
      'Pham Duc Kiet',
      'Hoang Anh Linh',
      'Vu Thanh Nam',
      'Vo Ngoc Phuc',
      'Dang Khanh Quang',
      'Bui Tuan Son',
      'Do Gia Thai',
      'Phan Minh Thu',
      'Huynh Bao Trang',
      'Ngo Quynh Vy',
    ],
  },
  {
    majorId: 3,
    emailPrefix: 'log',
    names: [
      'Nguyen Hai Dang',
      'Tran Duc Long',
      'Le Minh Triet',
      'Pham Quoc Tien',
      'Hoang Gia Bao',
      'Vu Thanh Binh',
      'Vo Minh Chau',
      'Dang Huy Cuong',
      'Bui Anh Duy',
      'Do Khanh Giang',
      'Phan Quoc Hien',
      'Huynh Bao Khanh',
      'Ngo Tuan Khoa',
    ],
  },
  {
    majorId: 4,
    emailPrefix: 'oto',
    names: [
      'Nguyen Quoc Lam',
      'Tran Minh Luan',
      'Le Thanh Manh',
      'Pham Gia Minh',
      'Hoang Duc Nghia',
      'Vu Bao Ngoc',
      'Vo Thanh Nhan',
      'Dang Gia Phong',
      'Bui Huu Quan',
      'Do Tuan Son',
      'Phan Minh Tam',
      'Huynh Dinh Thang',
      'Ngo Quoc Tuan',
    ],
  },
  {
    majorId: 5,
    emailPrefix: 'qtkd',
    names: [
      'Nguyen Bao Tram',
      'Tran Minh Thu',
      'Le Quynh Anh',
      'Pham Gia Binh',
      'Hoang Duc Cuong',
      'Vu Khanh Duong',
      'Vo Huu Giang',
      'Dang Minh Ha',
      'Bui Ngoc Hanh',
      'Do Phuong Hoa',
      'Phan Tuan Hung',
      'Huynh Thanh Mai',
      'Ngo Gia My',
    ],
  },
  {
    majorId: 6,
    emailPrefix: 'xnyh',
    names: [
      'Nguyen Minh Ngan',
      'Tran Gia Nhu',
      'Le Bao Oanh',
      'Pham Quoc Phat',
      'Hoang Thanh Phu',
      'Vu Minh Quyen',
      'Vo Bao Son',
      'Dang Anh Tai',
      'Bui Duc Thao',
      'Do Quynh Trang',
      'Phan Thanh Uyen',
      'Huynh Gia Van',
      'Ngo Khac Viet',
    ],
  },
]

async function getMajorInfo(pool) {
  const majorIds = MAJOR_CONFIGS.map((x) => x.majorId).join(',')
  const rs = await pool.request().query(`
    SELECT MaNganh, MaKhoa, TenNganh
    FROM NGANH
    WHERE MaNganh IN (${majorIds})
  `)

  const map = new Map()
  for (const row of rs.recordset) {
    map.set(Number(row.MaNganh), {
      majorId: Number(row.MaNganh),
      khoaId: Number(row.MaKhoa),
      majorName: row.TenNganh || `Nganh ${row.MaNganh}`,
    })
  }

  return map
}

async function getRiskCourses(pool, majorId) {
  const req = pool.request()
  req.input('majorId', sql.Int, majorId)
  const rs = await req.query(`
    SELECT TOP 52
      m.MaMon,
      COUNT(DISTINCT cm.MaGV) AS Experts,
      TRY_CONVERT(INT, m.HocKy) AS HocKy,
      m.LoaiMon
    FROM MON m
    LEFT JOIN CHUYEN_MON_CUA_GV cm ON cm.MaMon = m.MaMon
    WHERE CAST(m.MaNganh AS NVARCHAR(20)) = CAST(@majorId AS NVARCHAR(20))
    GROUP BY m.MaMon, m.HocKy, m.LoaiMon
    ORDER BY
      COUNT(DISTINCT cm.MaGV) ASC,
      CASE WHEN m.LoaiMon = N'Thuc hanh' OR m.LoaiMon = N'Thực hành' THEN 0 ELSE 1 END,
      TRY_CONVERT(INT, m.HocKy) DESC,
      m.MaMon ASC
  `)

  return rs.recordset.map((x) => Number(x.MaMon))
}

function assignCourses(courseIds, teacherCount) {
  const groups = Array.from({ length: teacherCount }, () => [])
  let cursor = 0

  for (const courseId of courseIds) {
    groups[cursor].push(courseId)
    cursor = (cursor + 1) % teacherCount
  }

  return groups.map((group, idx) => {
    if (group.length > 0) {
      return group.slice(0, 4)
    }

    return [courseIds[idx % courseIds.length]]
  })
}

async function getExistingIdentityData(pool) {
  const rs = await pool.request().query(`
    SELECT LOWER(EmailTK) AS Email, LOWER(TenTK) AS Username
    FROM TAI_KHOAN
    WHERE EmailTK IS NOT NULL OR TenTK IS NOT NULL
  `)

  const emailSet = new Set()
  const usernameSet = new Set()
  for (const row of rs.recordset) {
    if (row.Email) {
      emailSet.add(String(row.Email))
    }
    if (row.Username) {
      usernameSet.add(String(row.Username))
    }
  }

  const rs2 = await pool.request().query(`
    SELECT LOWER(EmailGV) AS Email
    FROM GIANG_VIEN
    WHERE EmailGV IS NOT NULL
  `)
  for (const row of rs2.recordset) {
    if (row.Email) {
      emailSet.add(String(row.Email))
    }
  }

  return { emailSet, usernameSet }
}

async function run() {
  const pool = await new sql.ConnectionPool(DB_CONFIG).connect()
  const transaction = new sql.Transaction(pool)

  try {
    const majorMap = await getMajorInfo(pool)
    const { emailSet, usernameSet } = await getExistingIdentityData(pool)

    const preparedAssignments = new Map()
    for (const majorCfg of MAJOR_CONFIGS) {
      const majorInfo = majorMap.get(majorCfg.majorId)
      if (!majorInfo) {
        throw new Error(`Khong tim thay nganh ${majorCfg.majorId}`)
      }

      const coursePool = await getRiskCourses(pool, majorCfg.majorId)
      if (coursePool.length === 0) {
        throw new Error(`Nganh ${majorCfg.majorId} khong co mon hoc de gan chuyen mon`)
      }

      preparedAssignments.set(
        majorCfg.majorId,
        assignCourses(coursePool, majorCfg.names.length),
      )
    }

    await transaction.begin()

    const inserted = []

    for (const majorCfg of MAJOR_CONFIGS) {
      const majorInfo = majorMap.get(majorCfg.majorId)
      const assignment = preparedAssignments.get(majorCfg.majorId)

      if (!majorInfo || !assignment) {
        throw new Error(`Thieu du lieu da chuan bi cho nganh ${majorCfg.majorId}`)
      }

      for (let i = 0; i < majorCfg.names.length; i += 1) {
        const index = String(i + 1).padStart(2, '0')
        let email = `${majorCfg.emailPrefix}.gv${index}.2026@autoseed.edu.vn`

        let suffix = 1
        while (emailSet.has(email.toLowerCase())) {
          email = `${majorCfg.emailPrefix}.gv${index}.2026.${suffix}@autoseed.edu.vn`
          suffix += 1
        }
        emailSet.add(email.toLowerCase())

        let tenTK = `${majorCfg.emailPrefix}_gv${index}_2026`
        let usernameSuffix = 1
        while (usernameSet.has(tenTK.toLowerCase())) {
          tenTK = `${majorCfg.emailPrefix}_gv${index}_2026_${usernameSuffix}`
          usernameSuffix += 1
        }
        usernameSet.add(tenTK.toLowerCase())

        const tenGV = majorCfg.names[i]
        const chucVu = i % 2 === 0 ? 'Thac si' : 'Tien si'

        const insertTK = new sql.Request(transaction)
        insertTK.input('TenTK', sql.VarChar(200), tenTK)
        insertTK.input('MatKhau', sql.VarChar(64), USER_PASSWORD_HASH)
        insertTK.input('EmailTK', sql.VarChar(200), email)
        insertTK.input('Quyen', sql.VarChar(20), 'user')
        const insertedTK = await insertTK.query(`
          INSERT INTO TAI_KHOAN (MaGV, TenTK, MatKhau, EmailTK, Quyen)
          OUTPUT inserted.MaTK
          VALUES (NULL, @TenTK, @MatKhau, @EmailTK, @Quyen)
        `)
        const maTK = Number(insertedTK.recordset[0].MaTK)

        const insertGV = new sql.Request(transaction)
        insertGV.input('MaTK', sql.Int, maTK)
        insertGV.input('MaKhoa', sql.Int, majorInfo.khoaId)
        insertGV.input('TenGV', sql.NVarChar(200), tenGV)
        insertGV.input('EmailGV', sql.NVarChar(200), email)
        insertGV.input('ChucVu', sql.NVarChar(200), chucVu)
        insertGV.input('TrangThai', sql.NVarChar(200), 'Co the day')
        const insertedGV = await insertGV.query(`
          INSERT INTO GIANG_VIEN (MaTK, MaKhoa, TenGV, EmailGV, ChucVu, TrangThai)
          OUTPUT inserted.MaGV
          VALUES (@MaTK, @MaKhoa, @TenGV, @EmailGV, @ChucVu, @TrangThai)
        `)
        const maGV = Number(insertedGV.recordset[0].MaGV)

        const updateTK = new sql.Request(transaction)
        updateTK.input('MaTK', sql.Int, maTK)
        updateTK.input('MaGV', sql.Int, maGV)
        await updateTK.query(`
          UPDATE TAI_KHOAN
          SET MaGV = @MaGV
          WHERE MaTK = @MaTK
        `)

        const assignedCourses = assignment[i]
        for (const maMon of assignedCourses) {
          const insertCM = new sql.Request(transaction)
          insertCM.input('MaGV', sql.Int, maGV)
          insertCM.input('MaMon', sql.Int, maMon)
          await insertCM.query(`
            IF NOT EXISTS (
              SELECT 1 FROM CHUYEN_MON_CUA_GV WHERE MaGV = @MaGV AND MaMon = @MaMon
            )
            INSERT INTO CHUYEN_MON_CUA_GV (MaGV, MaMon)
            VALUES (@MaGV, @MaMon)
          `)
        }

        inserted.push({
          maGV,
          maTK,
          majorId: majorCfg.majorId,
          majorName: majorInfo.majorName,
          tenGV,
          email,
          courseCount: assignedCourses.length,
        })
      }
    }

    await transaction.commit()

    const perMajor = inserted.reduce((acc, row) => {
      const key = `${row.majorId}-${row.majorName}`
      if (!acc[key]) {
        acc[key] = { teachers: 0, courses: 0 }
      }
      acc[key].teachers += 1
      acc[key].courses += row.courseCount
      return acc
    }, {})

    console.log('IMPORT_OK')
    console.log(`Inserted teachers: ${inserted.length}`)
    for (const [key, stats] of Object.entries(perMajor)) {
      console.log(`${key}: teachers=${stats.teachers}, assignedCourses=${stats.courses}`)
    }
    console.log('First 10 inserted:')
    console.log(JSON.stringify(inserted.slice(0, 10), null, 2))
  } catch (error) {
    if (transaction._aborted !== true) {
      try {
        await transaction.rollback()
      } catch (_rollbackError) {
        // Ignore rollback failure and surface original error.
      }
    }
    throw error
  } finally {
    await pool.close()
  }
}

run().catch((error) => {
  console.error('IMPORT_FAILED')
  console.error(error)
  process.exit(1)
})
