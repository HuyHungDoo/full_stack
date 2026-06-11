import sql from 'mssql'

const config = {
  server: process.env.DB_SERVER || 'DESKTOP-G0N1ESL',
  port: Number(process.env.DB_PORT || 52595),
  database: process.env.DATAMART_DATABASE || 'HQT_BanChuan',
  user: process.env.DB_USER || 'sa',
  password: process.env.DB_PASSWORD || 'hung4a123',
  options: {
    trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === 'true' || true,
    encrypt: process.env.DB_ENCRYPT === 'true' || false,
  },
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
