import tediousSql from 'mssql'
import windowsSql from 'mssql/msnodesqlv8.js'

const useWindowsAuth = process.env.DB_USE_WINDOWS_AUTH === 'true'
const sql = useWindowsAuth ? windowsSql : tediousSql

const server = process.env.DATAMART_SERVER || process.env.DB_SERVER || 'localhost'
const database = process.env.DATAMART_DATABASE || 'HQT_BanChuan'
const instanceName = process.env.DATAMART_INSTANCE !== undefined
  ? process.env.DATAMART_INSTANCE
  : (process.env.DB_INSTANCE || 'SQLEXPRESS')
const port = process.env.DATAMART_PORT || process.env.DB_PORT
const odbcDriver = process.env.DB_ODBC_DRIVER || 'ODBC Driver 17 for SQL Server'

// Instance mac dinh (khong co ten) + khong co port: dung connection string de tranh ket noi nham SQLEXPRESS qua port 1433
const connectionString = process.env.DATAMART_CONNECTION_STRING
  || (!instanceName && !port && useWindowsAuth
    ? `Driver={${odbcDriver}};Server=${server};Database=${database};Trusted_Connection=yes;TrustServerCertificate=yes;`
    : undefined)

const config = {
  server,
  database,
  ...(connectionString ? { connectionString } : {}),
  ...(useWindowsAuth
    ? { driver: process.env.DB_ODBC_DRIVER || 'ODBC Driver 17 for SQL Server' }
    : {}),
  options: {
    trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE !== 'false',
    encrypt: process.env.DB_ENCRYPT === 'true',
    ...(useWindowsAuth
      ? {
          trustedConnection: true,
          ...(instanceName ? { instanceName } : {}),
        }
      : {}),
  },
  ...(useWindowsAuth
    ? {}
    : {
        user: process.env.DATAMART_USER || process.env.DB_USER || 'sa',
        password: process.env.DATAMART_PASSWORD || process.env.DB_PASSWORD || '',
      }),
}

if (port) {
  config.port = Number(port)
}

let pool = null

export async function getDatamartPool() {
  if (pool) return pool
  try {
    console.log('[DatamartDB] Connecting to', {
      server: config.server,
      port: config.port,
      database: config.database,
      user: config.user,
    })
    pool = await new sql.ConnectionPool(config).connect()
    console.log('[DatamartDB] Connected successfully')
    return pool
  } catch (error) {
    console.error('[DatamartDB] Connection failed:', error.message)
    pool = null
    throw error
  }
}

export async function closeDatamartPool() {
  if (pool) {
    await pool.close()
    pool = null
  }
}

export async function query(text, params = {}) {
  const p = await getDatamartPool()
  const request = p.request()
  for (const key in params) {
    request.input(key, params[key])
  }
  const result = await request.query(text)
  return result.recordset || []
}

export async function queryOne(text, params = {}) {
  const rows = await query(text, params)
  return rows[0] || null
}
