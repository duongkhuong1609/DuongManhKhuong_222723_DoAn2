const sql=require('mssql')
const cfg={server:'localhost',instanceName:'SQLEXPRESS',database:'LAP_LICH_TU_DONG',authentication:{type:'default',options:{userName:'sa',password:'123456'}},options:{encrypt:false,trustServerCertificate:true}}
;(async()=>{
  const pool=await new sql.ConnectionPool(cfg).connect()
  const q=await pool.request().query(`
    SELECT TOP 30 gv.MaGV, gv.MaTK, gv.MaKhoa, gv.TenGV, gv.EmailGV, gv.ChucVu, gv.TrangThai,
           tk.TenTK, tk.EmailTK, tk.Quyen
    FROM GIANG_VIEN gv
    LEFT JOIN TAI_KHOAN tk ON tk.MaTK=gv.MaTK
    ORDER BY gv.MaGV DESC
  `)
  console.log(JSON.stringify(q.recordset,null,2))
  const majors=await pool.request().query(`
    SELECT n.MaNganh, n.MaKhoa, n.TenNganh, k.TenKhoa
    FROM NGANH n JOIN KHOA k ON k.MaKhoa=n.MaKhoa
    WHERE n.MaNganh IN (1,3,4,5,6)
    ORDER BY n.MaNganh
  `)
  console.log('MAJORS')
  console.log(JSON.stringify(majors.recordset,null,2))
  await pool.close()
})().catch(e=>{console.error(e);process.exit(1)})
