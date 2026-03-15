const sql=require('mssql')
const cfg={server:'localhost',instanceName:'SQLEXPRESS',database:'LAP_LICH_TU_DONG',authentication:{type:'default',options:{userName:'sa',password:'123456'}},options:{encrypt:false,trustServerCertificate:true}}
;(async()=>{
  const pool=await new sql.ConnectionPool(cfg).connect()
  const q=await pool.request().query(`
    SELECT t.name AS tableName, i.name AS indexName, i.is_unique, c.name AS columnName
    FROM sys.indexes i
    JOIN sys.index_columns ic ON i.object_id=ic.object_id AND i.index_id=ic.index_id
    JOIN sys.columns c ON ic.object_id=c.object_id AND ic.column_id=c.column_id
    JOIN sys.tables t ON i.object_id=t.object_id
    WHERE t.name IN ('GIANG_VIEN','TAI_KHOAN','CHUYEN_MON_CUA_GV') AND i.is_hypothetical=0
    ORDER BY t.name, i.name, ic.key_ordinal
  `)
  console.log(JSON.stringify(q.recordset,null,2))
  await pool.close()
})().catch(e=>{console.error(e);process.exit(1)})
