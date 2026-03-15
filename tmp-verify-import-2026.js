const sql=require('mssql')
const cfg={server:'localhost',instanceName:'SQLEXPRESS',database:'LAP_LICH_TU_DONG',authentication:{type:'default',options:{userName:'sa',password:'123456'}},options:{encrypt:false,trustServerCertificate:true},requestTimeout:120000}
;(async()=>{
 const pool=await new sql.ConnectionPool(cfg).connect()
 const q1=await pool.request().query(`
   SELECT COUNT(*) AS NewTK
   FROM TAI_KHOAN
   WHERE EmailTK LIKE '%.2026@autoseed.edu.vn' OR EmailTK LIKE '%.2026.%@autoseed.edu.vn'
 `)
 const q2=await pool.request().query(`
   SELECT COUNT(*) AS NewGV
   FROM GIANG_VIEN
   WHERE EmailGV LIKE '%.2026@autoseed.edu.vn' OR EmailGV LIKE '%.2026.%@autoseed.edu.vn'
 `)
 const q3=await pool.request().query(`
   SELECT COUNT(*) AS BrokenLink
   FROM GIANG_VIEN gv
   LEFT JOIN TAI_KHOAN tk ON tk.MaTK=gv.MaTK
   WHERE (gv.EmailGV LIKE '%.2026@autoseed.edu.vn' OR gv.EmailGV LIKE '%.2026.%@autoseed.edu.vn')
     AND (tk.MaTK IS NULL OR tk.MaGV<>gv.MaGV)
 `)
 const q4=await pool.request().query(`
   SELECT CAST(m.MaNganh AS NVARCHAR(20)) AS MaNganh, COUNT(DISTINCT cm.MaGV) AS NewGVWithCourse, COUNT(*) AS CourseLinks
   FROM CHUYEN_MON_CUA_GV cm
   JOIN GIANG_VIEN gv ON gv.MaGV=cm.MaGV
   JOIN MON m ON m.MaMon=cm.MaMon
   WHERE gv.EmailGV LIKE '%.2026@autoseed.edu.vn' OR gv.EmailGV LIKE '%.2026.%@autoseed.edu.vn'
   GROUP BY CAST(m.MaNganh AS NVARCHAR(20))
   ORDER BY CAST(m.MaNganh AS NVARCHAR(20))
 `)
 console.log('VERIFY', q1.recordset[0], q2.recordset[0], q3.recordset[0])
 console.log(JSON.stringify(q4.recordset,null,2))
 await pool.close()
})().catch(e=>{console.error(e);process.exit(1)})
