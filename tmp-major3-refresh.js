const sql=require('mssql')
const cfg={server:'localhost',instanceName:'SQLEXPRESS',database:'LAP_LICH_TU_DONG',authentication:{type:'default',options:{userName:'sa',password:'123456'}},options:{encrypt:false,trustServerCertificate:true}}
;(async()=>{
 const pool=await new sql.ConnectionPool(cfg).connect()
 const rs=(await pool.request().query(`
   SELECT TOP 70 m.MaMon,m.TenMon,m.LoaiMon,TRY_CONVERT(INT,m.HocKy) AS HocKy,COUNT(DISTINCT cm.MaGV) AS Experts
   FROM MON m LEFT JOIN CHUYEN_MON_CUA_GV cm ON cm.MaMon=m.MaMon
   WHERE CAST(m.MaNganh AS NVARCHAR(50))='3'
   GROUP BY m.MaMon,m.TenMon,m.LoaiMon,m.HocKy
   ORDER BY Experts ASC,m.MaMon
 `)).recordset||[]
 console.log(JSON.stringify(rs,null,2))
 await pool.close()
})().catch(e=>{console.error(e);process.exit(1)})
