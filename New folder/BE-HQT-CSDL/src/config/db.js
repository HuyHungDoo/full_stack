import tediousSql from 'mssql'
import windowsSql from 'mssql/msnodesqlv8.js'

const useWindowsAuth = process.env.DB_USE_WINDOWS_AUTH === 'true'
const sql = useWindowsAuth ? windowsSql : tediousSql

const server = process.env.DB_SERVER || 'localhost'
const instanceName = process.env.DB_INSTANCE || 'SQLEXPRESS'

const config = {
  server,
  database: process.env.DB_DATABASE || 'PharmacyFinance',
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

export async function getPool() {
  if (pool) return pool
  pool = await new sql.ConnectionPool(config).connect()
  return pool
}

export async function connectDB() {
  await getPool()
  console.log('Connected to SQL Server: ' + config.database)
}

export async function closePool() {
  if (pool) {
    await pool.close()
    pool = null
  }
}

// chay 1 cau SELECT/INSERT/UPDATE binh thuong
export async function query(text, params = {}) {
  const p = await getPool()
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

// chay nhieu query trong 1 transaction (insert phieu nhap, ban hang,...)
export async function withTransaction(callback) {
  const p = await getPool()
  const transaction = new sql.Transaction(p)
  await transaction.begin()

  const tx = async (text, params = {}) => {
    const request = new sql.Request(transaction)
    for (const key in params) {
      request.input(key, params[key])
    }
    const result = await request.query(text)
    return result.recordset || []
  }

  const txOne = async (text, params = {}) => {
    const rows = await tx(text, params)
    return rows[0] || null
  }

  try {
    const result = await callback({ tx, txOne, transaction, sql })
    await transaction.commit()
    return result
  } catch (err) {
    await transaction.rollback()
    throw err
  }
}

export { sql }
