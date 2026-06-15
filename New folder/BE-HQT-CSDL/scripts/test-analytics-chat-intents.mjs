/**
 * Chạy thử các câu hỏi chatbot theo bảng use-case.
 * node scripts/test-analytics-chat-intents.mjs
 */
import 'dotenv/config'
import { chatWithAnalyticsAgent } from '../src/services/analyticsChatAgent.service.js'
import { closeDatamartPool } from '../src/config/datamartDb.js'

const cases = [
  {
    group: 'Doanh thu',
    question: 'Doanh thu từ 2024-01-01 đến 2024-06-30',
    expectedTool: 'getSalesSummary',
  },
  {
    group: 'Xu hướng',
    question: 'Doanh thu theo tháng gần đây?',
    expectedTool: 'getSalesTrend',
    validateArgs: (a) => a.metric === 'revenue',
  },
  {
    group: 'AOV',
    question: 'AOV thay đổi ra sao?',
    expectedTool: 'getSalesTrend',
    validateArgs: (a) => a.metric === 'aov',
  },
  {
    group: 'Top thuốc (số lượng)',
    question: 'Thuốc nào bán chạy nhất?',
    expectedTool: 'getTopProducts',
    validateArgs: (a) => a.sortBy === 'quantity',
  },
  {
    group: 'Top thuốc (doanh thu)',
    question: 'Sản phẩm doanh thu cao nhất?',
    expectedTool: 'getTopProducts',
    validateArgs: (a) => a.sortBy === 'revenue',
  },
  {
    group: 'Danh mục',
    question: 'Nhóm nào tăng trưởng tốt?',
    expectedTool: 'getCategoryRevenue',
  },
  {
    group: 'Tồn kho thấp',
    question: 'Thuốc nào sắp hết hàng?',
    expectedTool: 'getLowStockAlerts',
  },
  {
    group: 'Giá trị tồn kho',
    question: 'Giá trị tồn kho theo danh mục',
    expectedTool: 'getInventoryValue',
    validateArgs: (a) => a.breakdown === 'category',
  },
  {
    group: 'Hủy hàng',
    question: 'Nhóm thuốc nào bị hủy nhiều nhất?',
    expectedTool: 'getStockLossSummary',
    validateArgs: (a) => a.groupBy === 'category',
  },
  {
    group: 'Khách hàng',
    question: 'Top KH mua nhiều nhất',
    expectedTool: 'getTopCustomers',
    validateArgs: (a) => a.sortBy === 'frequency',
  },
  {
    group: 'RFM',
    question: 'Phân nhóm khách hàng RFM',
    expectedTool: 'getRFMSegments',
  },
  {
    group: 'Ma trận',
    question: 'Phân tích ma trận ABC XYZ',
    expectedTool: 'getMatrixDistribution',
  },
  {
    group: 'Ô ma trận',
    question: 'Nhóm AX có những sản phẩm nào?',
    expectedTool: 'getProductsByMatrix',
    validateArgs: (a) => a.abcClass === 'A' && a.xyzClass === 'X',
  },
]

const results = []

for (const testCase of cases) {
  const row = {
    ...testCase,
    ok: false,
    actualTool: '-',
    answer: '',
    detail: '',
  }

  try {
    const res = await chatWithAnalyticsAgent({ message: testCase.question })
    const toolCall = res.toolCalls?.[0]
    row.actualTool = toolCall?.toolName || '(none)'
    row.answer = (res.answer || '').replace(/\s+/g, ' ').trim()

    const toolOk = row.actualTool === testCase.expectedTool
    const argsOk = testCase.validateArgs ? testCase.validateArgs(toolCall?.args || {}) : true
    row.ok = toolOk && argsOk

    if (!toolOk) row.detail = `expected ${testCase.expectedTool}, got ${row.actualTool}`
    else if (!argsOk) row.detail = `args: ${JSON.stringify(toolCall?.args || {})}`
  } catch (err) {
    row.detail = err.message
  }

  results.push(row)
}

console.log('\n=== Kết quả chạy thử chatbot (13 câu) ===\n')
for (const r of results) {
  console.log(`${r.ok ? 'PASS' : 'FAIL'} | ${r.group}`)
  console.log(`  Q: ${r.question}`)
  console.log(`  Tool: ${r.actualTool}${r.actualTool === r.expectedTool ? '' : ` (expected ${r.expectedTool})`}`)
  if (r.answer) console.log(`  Trả lời: ${r.answer.slice(0, 200)}${r.answer.length > 200 ? '...' : ''}`)
  if (!r.ok && r.detail) console.log(`  Lỗi: ${r.detail}`)
  console.log('')
}

const passed = results.filter((r) => r.ok).length
console.log(`=== ${passed}/${results.length} passed ===\n`)

await closeDatamartPool().catch(() => {})
process.exit(passed === results.length ? 0 : 1)
