const sql = require('mssql');

// SQL Server connection config
const config = {
  server: 'localhost',
  instanceName: 'SQLEXPRESS',
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
    trustServerCertificate: true,
    connectTimeout: 30000
  }
};

async function testConnection() {
  try {
    console.log('Đang kết nối tới SQL Server...');
    console.log(`Server: ${config.server}`);
    console.log(`Database: ${config.database}`);
    
    const pool = new sql.ConnectionPool(config);
    await pool.connect();
    
    console.log('✅ Kết nối thành công!');
    console.log(`Connection Pool State: ${pool.connected ? 'Connected' : 'Disconnected'}`);
    
    // Test query
    const result = await pool.request().query('SELECT @@VERSION as version');
    console.log('\n📊 SQL Server Version:');
    console.log(result.recordset[0].version);
    
    await pool.close();
    console.log('\n✅ Disconnected successfully');
    process.exit(0);
  } catch (err) {
    console.error('❌ Lỗi kết nối:', err.message);
    console.error('Chi tiết lỗi:', err);
    process.exit(1);
  }
}

testConnection();
