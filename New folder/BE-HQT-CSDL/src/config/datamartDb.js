import tediousSql from 'mssql'
import windowsSql from 'mssql/msnodesqlv8.js'

const useWindowsAuth = process.env.DB_USE_WINDOWS_AUTH === 'true'
const sql = useWindowsAuth ? windowsSql : tediousSql

const server = process.env.DB_SERVER || 'localhost'
const instanceName = process.env.DB_INSTANCE || 'SQLEXPRESS'

const config = {
  server,
  database: process.env.DATAMART_DATABASE || 'HQT_BanChuan',
  ...(useWindowsAuth
    ? { driver: process.env.DB_ODBC_DRIVER || 'ODBC Driver 17 for SQL Server' }
    : {}),
  options: {
    trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE !== 'false',
    encrypt: process.env.DB_ENCRYPT === 'true',
    ...(useWindowsAuth
      ? {
          trustedConnection: true,
          ...(process.env.DB_INSTANCE ? { instanceName } : {}),
        }
      : {}),
  },
  ...(useWindowsAuth
    ? {}
    : {
        user: process.env.DB_USER || 'sa',
        password: process.env.DB_PASSWORD || '',
      }),
}

if (process.env.DB_PORT) {
  config.port = Number(process.env.DB_PORT)
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
