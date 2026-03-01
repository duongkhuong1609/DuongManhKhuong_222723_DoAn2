const sql = require('mssql');

const config = {
  server: 'LAPTOP-5VTLAM86\\SQLEXPRESS',
  // port left unspecified when using named instance
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
    connectTimeout: 30000,
  },
};

async function dropTables() {
  let connection;
  try {
    connection = new sql.ConnectionPool(config);
    connection.on('error', (err) => console.error('Connection error:', err));
    await connection.connect();
    console.log('✅ Connected to SQL Server');

    const tablesToDrop = ['Class', 'Course', 'Instructor', 'Room', 'Semester'];

    for (const tbl of tablesToDrop) {
      // check if table exists
      const existsRes = await connection
        .request()
        .query(`SELECT OBJECT_ID('dbo.${tbl}', 'U') AS obj`);
      if (existsRes.recordset[0].obj) {
        console.log(`\nDropping table ${tbl} and any foreign keys referencing it...`);

        // drop foreign key constraints that reference this table
        const fkSql = `
          DECLARE @sql NVARCHAR(MAX) = N'';
          SELECT @sql += N'ALTER TABLE ' + QUOTENAME(OBJECT_SCHEMA_NAME(parent_object_id)) + '.' + QUOTENAME(OBJECT_NAME(parent_object_id))
                        + N' DROP CONSTRAINT ' + QUOTENAME(name) + N';\n'
          FROM sys.foreign_keys
          WHERE referenced_object_id = OBJECT_ID('dbo.${tbl}');
          EXEC sp_executesql @sql;
        `;
        await connection.request().query(fkSql);

        // drop the table
        await connection.request().query(`DROP TABLE dbo.${tbl}`);
        console.log(`✔ Table ${tbl} dropped`);
      } else {
        console.log(`Table ${tbl} does not exist, skipping.`);
      }
    }

    console.log('\n✅ All specified tables processed.');
  } catch (err) {
    console.error('Error during drop:', err);
  } finally {
    if (connection) await connection.close();
    console.log('✅ Disconnected');
  }
}

if (require.main === module) {
  dropTables();
}
