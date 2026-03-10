const sql=require('mssql');
const cfg={server:'localhost',instanceName:'SQLEXPRESS',database:'LAP_LICH_TU_DONG',authentication:{type:'default',options:{userName:'sa',password:'123456'}},options:{encrypt:false,trustServerCertificate:true}};
(async()=>{const p=await sql.connect(cfg); const c=await p.request().query("SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='LICH_DAY' ORDER BY ORDINAL_POSITION"); console.log(c.recordset); await p.close();})().catch(e=>{console.error(e);process.exit(1)});
