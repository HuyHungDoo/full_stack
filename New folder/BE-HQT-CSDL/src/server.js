import 'dotenv/config'
import app from './app.js'
import { connectDB, closePool } from './config/db.js'
import { closeDatamartPool } from './config/datamartDb.js'

const PORT = process.env.PORT || 3001

// bat loi uncaught EXCEPTION - phai dat truoc moi thu de catch het
// thuong la loi lap trinh (truy cap bien khong dinh nghia, gan undefined ...)
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err.message)
  console.error(err.stack)
  // loi nay khong recoverable -> exit
  process.exit(1)
})

let server = null

async function start() {
  try {
    await connectDB()

    server = app.listen(PORT, () => {
      console.log('Server is running on http://localhost:' + PORT)
      console.log('Mode:', process.env.NODE_ENV || 'development')
    })
  } catch (err) {
    console.error('Cannot start server:', err.message)
    process.exit(1)
  }
}

// loi tu Promise khong co .catch() - thuong tu network/db call sai
process.on('unhandledRejection', (err) => {
  console.error('UNHANDLED REJECTION:', err?.message || err)
  if (err?.stack) console.error(err.stack)
  // shutdown gracefully neu server da chay
  if (server) {
    server.close(() => process.exit(1))
  } else {
    process.exit(1)
  }
})

// graceful shutdown - dong pool truoc khi exit
async function shutdown(signal) {
  console.log('\nReceived ' + signal + ', shutting down...')
  if (server) server.close()
  try {
    await closePool()
    await closeDatamartPool()
  } catch (err) {
    console.error('Loi dong pool:', err.message)
  }
  process.exit(0)
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))

start()
