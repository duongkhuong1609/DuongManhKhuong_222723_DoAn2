const sql=require('mssql')
const cfg={server:'localhost',instanceName:'SQLEXPRESS',database:'LAP_LICH_TU_DONG',authentication:{type:'default',options:{userName:'sa',password:'123456'}},options:{encrypt:false,trustServerCertificate:true}}
;(async()=>{
 const pool=await new sql.ConnectionPool(cfg).connect()
 const q=await pool.request().query(`SELECT TOP 5 MaTK,TenTK,MatKhau,EmailTK,Quyen FROM TAI_KHOAN ORDER BY MaTK DESC`)
 console.log(JSON.stringify(q.recordset,null,2))
 await pool.close()
})().catch(e=>{console.error(e);process.exit(1)})
