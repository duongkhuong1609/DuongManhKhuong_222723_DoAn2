const sql=require('mssql')
const cfg={server:'localhost',instanceName:'SQLEXPRESS',database:'LAP_LICH_TU_DONG',authentication:{type:'default',options:{userName:'sa',password:'123456'}},options:{encrypt:false,trustServerCertificate:true}}
;(async()=>{
 const pool=await new sql.ConnectionPool(cfg).connect()
 const row=(await pool.request().query(`SELECT TOP 1 gi.MaGV AS code, gi.TenGV AS name, gi.EmailGV AS email, gi.ChucVu AS position, k.TenKhoa AS department, gi.TrangThai AS status FROM GIANG_VIEN gi JOIN KHOA k ON k.MaKhoa=gi.MaKhoa ORDER BY gi.MaGV DESC`)).recordset[0]
 console.log(JSON.stringify(row,null,2))
 await pool.close()
})().catch(e=>{console.error(e);process.exit(1)})
