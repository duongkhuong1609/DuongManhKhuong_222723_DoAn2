const sql=require('mssql')
const cfg={server:'localhost',instanceName:'SQLEXPRESS',database:'LAP_LICH_TU_DONG',authentication:{type:'default',options:{userName:'sa',password:'123456'}},options:{encrypt:false,trustServerCertificate:true}}
;(async()=>{
 const pool=await new sql.ConnectionPool(cfg).connect()
 const rs=(await pool.request().query(`
   SELECT CAST(n.MaNganh AS NVARCHAR(50)) AS MaNganh, n.TenNganh,
          COUNT(DISTINCT m.MaMon) AS MonCount,
          COUNT(DISTINCT h.MaMon) AS MonInHK3134,
          COUNT(DISTINCT cm.MaMon) AS MonCoChuyenMonGV
   FROM NGANH n
   LEFT JOIN MON m ON m.MaNganh=n.MaNganh
   LEFT JOIN HOC_KY_CAC_MON_HOC h ON h.MaMon=m.MaMon AND h.MaHK IN (31,32,33,34)
   LEFT JOIN CHUYEN_MON_CUA_GV cm ON cm.MaMon=m.MaMon
   GROUP BY n.MaNganh,n.TenNganh
   ORDER BY n.MaNganh
 `)).recordset||[]
 console.log(JSON.stringify(rs,null,2))
 await pool.close()
})().catch(e=>{console.error(e);process.exit(1)})
