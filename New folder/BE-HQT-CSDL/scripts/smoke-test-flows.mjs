/**
 * Smoke test các luồng API chính.
 * Chạy: node scripts/smoke-test-flows.mjs
 * Hoặc: $env:TEST_USERNAME='admin01'; $env:TEST_PASSWORD='...'; node scripts/smoke-test-flows.mjs
 */
const BASE = process.env.API_BASE || 'http://localhost:3001/api'

const results = []

function pass(name, detail = '') {
  results.push({ name, ok: true, detail })
  console.log(`✓ ${name}${detail ? ` — ${detail}` : ''}`)
}

function fail(name, detail = '') {
  results.push({ name, ok: false, detail })
  console.log(`✗ ${name}${detail ? ` — ${detail}` : ''}`)
}

async function request(method, path, { token, body, expect } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })

  let data = null
  const text = await res.text()
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = text
  }

  if (expect !== undefined && res.status !== expect) {
    throw new Error(`HTTP ${res.status} (expected ${expect}): ${data?.message || text}`)
  }

  if (!res.ok && expect === undefined) {
    throw new Error(`HTTP ${res.status}: ${data?.message || text}`)
  }

  return { status: res.status, data }
}

async function login(username, password) {
  const { data } = await request('POST', '/auth/login', {
    body: { username, password },
  })
  return data?.data?.token
}

async function main() {
  console.log(`\n=== Smoke test: ${BASE} ===\n`)

  try {
    const health = await request('GET', '/health')
    if (health.data?.success) pass('Health check')
    else fail('Health check', 'unexpected response')
  } catch (e) {
    fail('Health check', e.message)
    printSummary()
    process.exit(1)
  }

  try {
    await request('GET', '/medicines?page=1&limit=1', { expect: 401 })
    pass('Auth guard — medicines')
  } catch (e) {
    fail('Auth guard — medicines', e.message)
  }

  let token = null
  const username = process.env.TEST_USERNAME
  const password = process.env.TEST_PASSWORD

  if (username && password) {
    try {
      token = await login(username, password)
      pass('Login', username)
    } catch (e) {
      fail('Login', e.message)
    }
  } else {
    console.log('! Bỏ qua test có auth — đặt TEST_USERNAME và TEST_PASSWORD để test đầy đủ\n')
  }

  if (!token) {
    printSummary()
    process.exit(results.every((r) => r.ok) ? 0 : 1)
  }

  const today = new Date()
  const to = formatLocalDate(today)
  const from = formatLocalDate(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6))

  const tests = [
    ['GET /auth/me', () => request('GET', '/auth/me', { token })],
    ['GET /medicines', () => request('GET', '/medicines?page=1&limit=5', { token })],
    ['GET /medicines/stats', () => request('GET', '/medicines/stats', { token })],
    ['GET /categories', () => request('GET', '/categories', { token })],
    ['GET /units', () => request('GET', '/units', { token })],
    ['GET /customers', () => request('GET', '/customers?page=1&limit=5', { token })],
    ['GET /employees', () => request('GET', '/employees?page=1&limit=5', { token })],
    ['GET /sales-invoices', () => request('GET', '/sales-invoices?page=1&limit=5', { token })],
    ['GET /purchase-receipts', () => request('GET', '/purchase-receipts?page=1&limit=5', { token })],
    ['GET /stock-writeoffs/expiring', () => request('GET', '/stock-writeoffs/expiring?daysAhead=30', { token })],
    ['GET /alerts', () => request('GET', '/alerts?status=PENDING', { token })],
    ['GET /reports/revenue', () => request('GET', `/reports/revenue?from=${from}&to=${to}&groupBy=day`, { token })],
    ['GET /reports/profit-loss', () => request('GET', `/reports/profit-loss?from=${from}&to=${to}`, { token })],
    ['GET /reports/top-medicines', () => request('GET', `/reports/top-medicines?from=${from}&to=${to}&limit=5`, { token })],
    ['GET /analytics-agent/meta', () => request('GET', '/analytics-agent/meta', { token })],
    ['GET /analytics-agent/sales-summary', () => request('GET', `/analytics-agent/sales-summary?startDate=${from}&endDate=${to}`, { token })],
  ]

  for (const [name, fn] of tests) {
    try {
      const res = await fn()
      const count = Array.isArray(res.data?.data)
        ? res.data.data.length
        : res.data?.data?.items?.length ?? res.data?.data?.meta?.total
      pass(name, count !== undefined ? `items=${count}` : 'ok')
    } catch (e) {
      fail(name, e.message)
    }
  }

  printSummary()
  process.exit(results.every((r) => r.ok) ? 0 : 1)
}

function formatLocalDate(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function printSummary() {
  const ok = results.filter((r) => r.ok).length
  const total = results.length
  console.log(`\n=== Kết quả: ${ok}/${total} passed ===\n`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
