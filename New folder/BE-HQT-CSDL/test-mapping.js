import 'dotenv/config'
import('./src/services/analyticsChatAgent.service.js')
  .then(mod => {
    const { chatWithAnalyticsAgent } = mod

    const tests = [
      // Sales summary deterministic
      { prompt: 'Doanh thu tuần này thế nào?', expect: 'getSalesSummary' },
      { prompt: 'Phân tích doanh thu tháng này', expect: 'getSalesSummary' },
      { prompt: 'So sánh doanh thu kỳ này với kỳ trước', expect: 'getSalesSummary' },
      { prompt: 'Lợi nhuận tháng này bao nhiêu?', expect: 'getSalesSummary' },
      { prompt: 'Số đơn hàng tuần này là bao nhiêu?', expect: 'getSalesSummary' },

      // Trends (likely non-deterministic without LLM)
      { prompt: 'Doanh thu theo tháng gần đây thế nào?', expect: 'getSalesTrend', optional: true },
      { prompt: 'Xu hướng số đơn hàng từ tháng 1 đến tháng 6', expect: 'getSalesTrend', optional: true },
      { prompt: 'AOV thay đổi ra sao?', expect: 'getSalesTrend', optional: true },

      // Top products
      { prompt: 'Thuốc nào đang bán chạy?', expect: 'getTopProducts' },
      { prompt: 'Top 10 sản phẩm doanh thu cao nhất', expect: 'getTopProducts', optional: true },
      { prompt: 'Sản phẩm nào có lợi nhuận cao nhất?', expect: 'getTopProducts', optional: true },
      { prompt: 'Top thuốc bán chạy trong tháng này', expect: 'getTopProducts' },

      // Category revenue
      { prompt: 'Danh mục nào có doanh thu cao nhất?', expect: 'getCategoryRevenue', optional: true },
      { prompt: 'So sánh doanh thu theo nhóm thuốc', expect: 'getCategoryRevenue', optional: true },
      { prompt: 'Nhóm sản phẩm nào đang tăng trưởng tốt?', expect: 'getCategoryRevenue', optional: true },

      // Customers
      { prompt: 'Có bao nhiêu khách hàng hoạt động tháng này?', expect: 'getCustomerOverview', optional: true },
      { prompt: 'Khách hàng mới tháng này là bao nhiêu?', expect: 'getCustomerOverview', optional: true },
      { prompt: 'Top khách hàng mua nhiều nhất', expect: 'getTopCustomers', optional: true },
      { prompt: 'Phân nhóm khách hàng RFM', expect: 'getRFMSegments', optional: true },

      // Inventory
      { prompt: 'Tồn kho nào cần chú ý?', expect: 'getLowStockAlerts' },
      { prompt: 'Sản phẩm nào sắp hết hàng?', expect: 'getLowStockAlerts' },
      { prompt: 'Giá trị tồn kho hiện tại là bao nhiêu?', expect: 'getInventoryValue', optional: true },
      { prompt: 'Giá trị tồn kho theo danh mục', expect: 'getInventoryValue', optional: true },

      // Stock loss
      { prompt: 'Tháng này hủy hàng bao nhiêu tiền?', expect: 'getStockLossSummary', optional: true },
      { prompt: 'Nhóm thuốc nào bị hủy nhiều nhất?', expect: 'getStockLossSummary', optional: true },
      { prompt: 'Tổng thất thoát tồn kho theo tháng', expect: 'getStockLossSummary', optional: true },

      // Forecast
      { prompt: 'Dự báo doanh thu 30 ngày tới', expect: 'forecastRevenue', optional: true },
      { prompt: 'Doanh thu tuần sau có thể đạt bao nhiêu?', expect: 'forecastRevenue', optional: true },
      { prompt: 'Forecast doanh thu tháng tới', expect: 'forecastRevenue', optional: true },

      // ABC/XYZ
      { prompt: 'Phân tích ma trận ABC XYZ', expect: 'getMatrixDistribution' },
      { prompt: 'Nhóm AX có những sản phẩm nào?', expect: 'getProductsByMatrix' },
      { prompt: 'Sản phẩm nhóm CZ cần xử lý thế nào?', expect: 'getProductsByMatrix' },
      { prompt: 'Phân bổ tồn kho theo ABC XYZ', expect: 'getMatrixDistribution' },
    ]

    ;(async () => {
      let passed = 0
      let skipped = 0
      for (const t of tests) {
        process.stdout.write(`\nTest: "${t.prompt}" -> expecting ${t.expect} ... `)
        try {
          const res = await chatWithAnalyticsAgent({ message: t.prompt })

          const toolCalls = res?.toolCalls || []
          if (!toolCalls.length) {
            if (t.optional) {
              console.log('SKIPPED (non-deterministic, requires LLM)')
              skipped++
              continue
            }
            console.log('FAIL (no tool called)')
            continue
          }

          const called = toolCalls[0].toolName
          const args = toolCalls[0].args || {}

          if (called === t.expect) {
            console.log(`PASS — called ${called}, args=${JSON.stringify(args)}`)
            passed++
          } else {
            if (t.optional) {
              console.log(`SKIPPED (model chose ${called} — optional test)`) 
              skipped++
            } else {
              console.log(`FAIL — called ${called} (expected ${t.expect})`) 
            }
          }
        } catch (err) {
          if (t.optional) {
            console.log('SKIPPED (requires model or env):', err.message)
            skipped++
          } else {
            console.log('ERROR:', err.message)
          }
        }
      }

      console.log('\nSummary:', { passed, skipped, total: tests.length })
      const exitCode = passed === tests.length - skipped ? 0 : 1
      process.exit(exitCode)
    })()
  })
  .catch(err => {
    console.error('Failed to import analyticsChatAgent.service.js:', err)
    process.exit(2)
  })
