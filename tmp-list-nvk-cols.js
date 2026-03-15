const sql = require('mssql')

const cfg = {
  server: 'localhost',
  instanceName: 'SQLEXPRESS',
  database: 'LAP_LICH_TU_DONG',
  authentication: { type: 'default', options: { userName: 'sa', password: '123456' } },
  options: { encrypt: false, trustServerCertificate: true },
}

;(async () => {
  const pool = await new sql.ConnectionPool(cfg).connect()
  try {
    const cols = await pool.request().query(`
      SELECT
        c.COLUMN_NAME,
        c.DATA_TYPE,
        c.IS_NULLABLE,
        COLUMNPROPERTY(OBJECT_ID(c.TABLE_SCHEMA + '.' + c.TABLE_NAME), c.COLUMN_NAME, 'IsIdentity') AS IsIdentity
      FROM INFORMATION_SCHEMA.COLUMNS c
      WHERE c.TABLE_NAME = 'NGUYEN_VONG_KHAC'
      ORDER BY c.ORDINAL_POSITION
    `)

    const pk = await pool.request().query(`
      SELECT k.COLUMN_NAME
      FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS t
      INNER JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE k
        ON t.CONSTRAINT_NAME = k.CONSTRAINT_NAME
       AND t.TABLE_NAME = k.TABLE_NAME
      WHERE t.TABLE_NAME = 'NGUYEN_VONG_KHAC'
        AND t.CONSTRAINT_TYPE = 'PRIMARY KEY'
    `)

    console.log(JSON.stringify({
      ok: true,
      columns: cols.recordset || [],
      primaryKey: (pk.recordset || []).map((r) => r.COLUMN_NAME),
    }, null, 2))
  } finally {
    await pool.close()
  }
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
