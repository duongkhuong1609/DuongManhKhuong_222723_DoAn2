const sql=require('mssql')
const cfg={server:'localhost',instanceName:'SQLEXPRESS',database:'LAP_LICH_TU_DONG',authentication:{type:'default',options:{userName:'sa',password:'123456'}},options:{encrypt:false,trustServerCertificate:true}}
;(async()=>{
 const pool=await new sql.ConnectionPool(cfg).connect()
 const rs=await pool.request().query(`
   SELECT t.name AS TableName,c.name AS ColumnName,COLUMNPROPERTY(c.object_id,c.name,'IsIdentity') AS IsIdentity
   FROM sys.tables t
   JOIN sys.columns c ON t.object_id=c.object_id
   WHERE t.name IN ('GIANG_VIEN','TAI_KHOAN') AND c.name IN ('MaGV','MaTK')
   ORDER BY t.name,c.name
 `)
 console.log(JSON.stringify(rs.recordset,null,2))
 await pool.close()
})().catch(e=>{console.error(e);process.exit(1)})
