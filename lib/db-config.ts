export const MSSQL_DB_CONFIG = {
  server: "localhost",
  instanceName: "SQLEXPRESS",
  database: "LAP_LICH_TU_DONG",
  authentication: {
    type: "default",
    options: {
      userName: "sa",
      password: "123456",
    },
  },
  options: {
    encrypt: false,
    trustServerCertificate: true,
  },
}
