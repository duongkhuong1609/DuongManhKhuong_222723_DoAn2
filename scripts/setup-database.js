const sql = require('mssql');

const config = {
  server: 'LAPTOP-5VTLAM86',
  port: 1433,
  database: 'LAP_LICH_TU_DONG',
  authentication: {
    type: 'default',
    options: {
      userName: 'sa',
      password: '123456'
    }
  },
  options: {
    encrypt: false,
    trustServerCertificate: true
  }
};

async function createDatabase() {
  let connection;
  try {
    console.log('Đang kết nối tới SQL Server...');
    connection = new sql.ConnectionPool(config);
    
    connection.on('error', function(err) {
      console.error('Connection error:', err);
    });

    await connection.connect();
    console.log('✅ Kết nối thành công!');

    // Get SQL Server version
    let result = await connection.request().query('SELECT @@VERSION as version');
    console.log('\n📊 SQL Server Version:', result.recordset[0].version);

    // Create Semesters table
    await connection.request().query(`
      IF NOT EXISTS(SELECT * FROM sys.tables WHERE name = 'Semester')
      CREATE TABLE Semester (
        id INT PRIMARY KEY IDENTITY(1,1),
        code VARCHAR(50) UNIQUE NOT NULL,
        name VARCHAR(100) NOT NULL,
        shortName VARCHAR(20),
        semesterNumber INT,
        academicYear VARCHAR(10),
        startDate DATETIME2,
        endDate DATETIME2,
        isActive BIT DEFAULT 1,
        isCurrent BIT DEFAULT 0,
        status VARCHAR(50) DEFAULT 'upcoming',
        createdAt DATETIME2 DEFAULT GETDATE(),
        updatedAt DATETIME2 DEFAULT GETDATE()
      )
    `);
    console.log('✅ Table Semester created/exists');

    // Create Instructors table
    await connection.request().query(`
      IF NOT EXISTS(SELECT * FROM sys.tables WHERE name = 'Instructor')
      CREATE TABLE Instructor (
        id INT PRIMARY KEY IDENTITY(1,1),
        code VARCHAR(50) UNIQUE NOT NULL,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(100) UNIQUE,
        phone VARCHAR(20),
        department VARCHAR(100),
        position VARCHAR(50) DEFAULT 'Giảng viên',
        maxHoursPerWeek INT DEFAULT 20,
        createdAt DATETIME2 DEFAULT GETDATE(),
        updatedAt DATETIME2 DEFAULT GETDATE()
      )
    `);
    console.log('✅ Table Instructor created/exists');

    // Create Courses table
    await connection.request().query(`
      IF NOT EXISTS(SELECT * FROM sys.tables WHERE name = 'Course')
      CREATE TABLE Course (
        id INT PRIMARY KEY IDENTITY(1,1),
        code VARCHAR(50) UNIQUE NOT NULL,
        name VARCHAR(100) NOT NULL,
        credits INT,
        theoryHours INT,
        practiceHours INT,
        department VARCHAR(100),
        type VARCHAR(50),
        createdAt DATETIME2 DEFAULT GETDATE(),
        updatedAt DATETIME2 DEFAULT GETDATE()
      )
    `);
    console.log('✅ Table Course created/exists');

    // Create Rooms table
    await connection.request().query(`
      IF NOT EXISTS(SELECT * FROM sys.tables WHERE name = 'Room')
      CREATE TABLE Room (
        id INT PRIMARY KEY IDENTITY(1,1),
        code VARCHAR(50) UNIQUE NOT NULL,
        name VARCHAR(100) NOT NULL,
        area VARCHAR(50),
        type VARCHAR(50),
        capacity INT,
        status VARCHAR(50) DEFAULT 'available',
        createdAt DATETIME2 DEFAULT GETDATE(),
        updatedAt DATETIME2 DEFAULT GETDATE()
      )
    `);
    console.log('✅ Table Room created/exists');

    // Create Classes table
    await connection.request().query(`
      IF NOT EXISTS(SELECT * FROM sys.tables WHERE name = 'Class')
      CREATE TABLE Class (
        id INT PRIMARY KEY IDENTITY(1,1),
        code VARCHAR(50) UNIQUE NOT NULL,
        name VARCHAR(100) NOT NULL,
        major VARCHAR(100),
        department VARCHAR(100),
        year INT,
        studentCount INT,
        semesterId INT,
        createdAt DATETIME2 DEFAULT GETDATE(),
        updatedAt DATETIME2 DEFAULT GETDATE()
      )
    `);
    console.log('✅ Table Class created/exists');

    console.log('\n✅ Database setup hoàn thành!');
    
  } catch (err) {
    console.error('❌ Lỗi:', err.message);
    if (err.originalError) {
      console.error('Chi tiết:', err.originalError.message);
    }
  } finally {
    if (connection) {
      await connection.close();
      console.log('✅ Disconnected');
    }
  }
}

createDatabase();
