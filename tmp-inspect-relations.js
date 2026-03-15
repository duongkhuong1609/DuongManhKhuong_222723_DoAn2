const sql=require('mssql')
const cfg={server:'localhost',instanceName:'SQLEXPRESS',database:'LAP_LICH_TU_DONG',authentication:{type:'default',options:{userName:'sa',password:'123456'}},options:{encrypt:false,trustServerCertificate:true}}
;(async()=>{
 const pool=await new sql.ConnectionPool(cfg).connect()
 const fks=await pool.request().query(`
 SELECT
   fk.name AS FK_Name,
   tp.name AS ParentTable,
   cp.name AS ParentColumn,
   tr.name AS RefTable,
   cr.name AS RefColumn
 FROM sys.foreign_key_columns fkc
 JOIN sys.foreign_keys fk ON fkc.constraint_object_id=fk.object_id
 JOIN sys.tables tp ON fkc.parent_object_id=tp.object_id
 JOIN sys.columns cp ON fkc.parent_object_id=cp.object_id AND fkc.parent_column_id=cp.column_id
 JOIN sys.tables tr ON fkc.referenced_object_id=tr.object_id
 JOIN sys.columns cr ON fkc.referenced_object_id=cr.object_id AND fkc.referenced_column_id=cr.column_id
 WHERE tp.name IN ('GIANG_VIEN','TAI_KHOAN','CHUYEN_MON_CUA_GV') OR tr.name IN ('GIANG_VIEN','TAI_KHOAN','CHUYEN_MON_CUA_GV')
 ORDER BY tp.name,fk.name
 `)
 console.log('FKS')
 console.log(JSON.stringify(fks.recordset,null,2))
 const cols=await pool.request().query(`
 SELECT TABLE_NAME,COLUMN_NAME,DATA_TYPE,IS_NULLABLE,CHARACTER_MAXIMUM_LENGTH
 FROM INFORMATION_SCHEMA.COLUMNS
 WHERE TABLE_NAME IN ('GIANG_VIEN','TAI_KHOAN','CHUYEN_MON_CUA_GV','NGANH','KHOA')
 ORDER BY TABLE_NAME,ORDINAL_POSITION
 `)
 console.log('COLS')
 console.log(JSON.stringify(cols.recordset,null,2))
 await pool.close()
})().catch(e=>{console.error(e);process.exit(1)})
