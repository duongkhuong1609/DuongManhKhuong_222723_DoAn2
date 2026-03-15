const sql=require('mssql')
const cfg={server:'localhost',instanceName:'SQLEXPRESS',database:'LAP_LICH_TU_DONG',authentication:{type:'default',options:{userName:'sa',password:'123456'}},options:{encrypt:false,trustServerCertificate:true},requestTimeout:15000}
;(async()=>{
 const pool=await new sql.ConnectionPool(cfg).connect()
 const a=await pool.request().query('SELECT COUNT(*) AS c FROM TAI_KHOAN')
 const b=await pool.request().query('SELECT COUNT(*) AS c FROM GIANG_VIEN')
 const c=await pool.request().query('SELECT COUNT(*) AS c FROM CHUYEN_MON_CUA_GV')
 console.log(a.recordset[0],b.recordset[0],c.recordset[0])
 await pool.close()
})().catch(e=>{console.error(e);process.exit(1)})
