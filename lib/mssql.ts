const sql = require("mssql")

type DbConfig = Record<string, any>

type GlobalMssqlStore = typeof globalThis & {
  __mssqlPools?: Map<string, Promise<any>>
}

const globalStore = globalThis as GlobalMssqlStore

if (!globalStore.__mssqlPools) {
  globalStore.__mssqlPools = new Map<string, Promise<any>>()
}

const mssqlPools = globalStore.__mssqlPools

const stableStringify = (value: any): string => {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value)
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`
  }

  const keys = Object.keys(value).sort()
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`
}

const toNumberOrFallback = (value: unknown, fallback: number) => {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

const normalizeMssqlConfig = (config: DbConfig): DbConfig => {
  const server = String(process.env.DB_SERVER || config.server || "localhost").trim()
  const instanceName = String(process.env.DB_INSTANCE || config.instanceName || "SQLEXPRESS").trim()
  const database = String(process.env.DB_NAME || config.database || "LAP_LICH_TU_DONG").trim()
  const userName = String(process.env.DB_USER || config?.authentication?.options?.userName || "sa").trim()
  const password = String(process.env.DB_PASSWORD || config?.authentication?.options?.password || "").trim()

  const connectTimeout = toNumberOrFallback(
    process.env.DB_CONNECT_TIMEOUT_MS || config.connectionTimeout,
    15000,
  )
  const requestTimeout = toNumberOrFallback(
    process.env.DB_REQUEST_TIMEOUT_MS || config.requestTimeout,
    45000,
  )

  const poolMax = toNumberOrFallback(process.env.DB_POOL_MAX || config?.pool?.max, 20)
  const poolMin = toNumberOrFallback(process.env.DB_POOL_MIN || config?.pool?.min, 2)
  const poolIdleMs = toNumberOrFallback(
    process.env.DB_POOL_IDLE_MS || config?.pool?.idleTimeoutMillis,
    30000,
  )

  return {
    ...config,
    server,
    instanceName,
    database,
    authentication: {
      type: "default",
      options: {
        userName,
        password,
      },
    },
    options: {
      encrypt: false,
      trustServerCertificate: true,
      ...config.options,
      enableArithAbort: true,
    },
    connectionTimeout: connectTimeout,
    requestTimeout,
    pool: {
      max: poolMax,
      min: Math.min(poolMin, poolMax),
      idleTimeoutMillis: poolIdleMs,
      ...config.pool,
    },
  }
}

const buildConfigKey = (config: DbConfig) => stableStringify(config)

const connectWithRetry = async (config: DbConfig, retryCount = 1): Promise<any> => {
  try {
    return await new sql.ConnectionPool(config).connect()
  } catch (error) {
    if (retryCount <= 0) throw error
    await new Promise((resolve) => setTimeout(resolve, 300))
    return connectWithRetry(config, retryCount - 1)
  }
}

export const getMssqlPool = async (config: DbConfig) => {
  const normalizedConfig = normalizeMssqlConfig(config)
  const configKey = buildConfigKey(normalizedConfig)

  if (!mssqlPools.has(configKey)) {
    const poolPromise = connectWithRetry(normalizedConfig, 1)
      .then((pool: any) => {
        pool.on("error", () => {
          mssqlPools.delete(configKey)
        })
        return pool
      })
      .catch((error: any) => {
        mssqlPools.delete(configKey)
        throw error
      })

    mssqlPools.set(configKey, poolPromise)
  }

  return mssqlPools.get(configKey)
}
