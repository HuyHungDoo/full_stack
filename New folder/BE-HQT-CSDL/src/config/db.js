import sql from 'mssql'

const config = {
  server: process.env.DB_SERVER || 'DESKTOP-G0N1ESL',
  port: Number(process.env.DB_PORT || 52595),
  database: process.env.DB_DATABASE || 'PharmacyFinance',
  user: process.env.DB_USER || 'sa',
  password: process.env.DB_PASSWORD || 'hung4a123',
  options: {
    trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === 'true' || true,
    encrypt: process.env.DB_ENCRYPT === 'true' || false,
  }
}

let pool = null

export async function getPool() {
  if (pool) return pool
  console.log(config);
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
