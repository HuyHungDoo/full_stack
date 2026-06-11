import { useEffect, useRef, useState } from 'react'
import { FaChartLine, FaPaperPlane, FaRobot, FaTimes } from 'react-icons/fa'
import { chatWithAnalyticsAgent } from '../../api/analyticsAgentService'
import { getApiErrorMessage } from '../../api/client'

// FIX #9: Tính khoảng 30 ngày gần nhất tính từ hôm nay để quick prompts
// không bao giờ kích hoạt guard "dữ liệu chưa cập nhật"
function buildQuickPrompts() {
  const today = new Date()
  const endDate = today.toISOString().slice(0, 10)
  const startDate = new Date(today)
  startDate.setUTCDate(startDate.getUTCDate() - 29)
  const startStr = startDate.toISOString().slice(0, 10)

  return [
    `Tóm tắt doanh thu từ ${startStr} đến ${endDate}`,
    `Thuốc nào bán chạy nhất từ ${startStr} đến ${endDate}?`,
    'Tồn kho nào cần chú ý?',
  ]
}

const initialMessages = [
  {
    id: 1,
    sender: 'bot',
    text: 'Xin chào, tôi là trợ lý phân tích. Bạn có thể hỏi về doanh thu, thuốc bán chạy, tồn kho, khách hàng hoặc dự báo doanh thu.',
  },
]

export default function AdminAnalyticsChatbot() {
  const [isOpen, setIsOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [messages, setMessages] = useState(initialMessages)
  const [isLoading, setIsLoading] = useState(false)
  // FIX #9: Tính quick prompts 1 lần khi mount, không tính lại mỗi render
  const [quickPrompts] = useState(buildQuickPrompts)
  const listRef = useRef(null)

  useEffect(() => {
    if (isOpen) {
      listRef.current?.scrollTo({
        top: listRef.current.scrollHeight,
        behavior: 'smooth',
      })
    }
  }, [isOpen, messages, isLoading])

  const sendMessage = async (text) => {
    const trimmed = text.trim()
    if (!trimmed || isLoading) return

    setMessages((current) => [
      ...current,
      {
        id: Date.now(),
        sender: 'user',
        text: trimmed,
      },
    ])
    setMessage('')
    setIsLoading(true)

    try {
      const result = await chatWithAnalyticsAgent({ message: trimmed })
      setMessages((current) => [
        ...current,
        {
          id: Date.now() + 1,
          sender: 'bot',
          text: result?.answer || 'Tôi chưa tạo được câu trả lời phân tích.',
        },
      ])
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          id: Date.now() + 1,
          sender: 'bot',
          text: getApiErrorMessage(error, 'Không lấy được dữ liệu phân tích. Vui lòng thử lại sau.'),
        },
      ])
    } finally {
      setIsLoading(false)
    }
  }

  const handleSubmit = (event) => {
    event.preventDefault()
    sendMessage(message)
  }

  return (
    <div className="fixed bottom-5 right-5 z-[90] flex flex-col items-end gap-4">
      {isOpen && (
        <section className="flex h-[min(34rem,calc(100dvh-7rem))] w-[min(calc(100vw-2rem),24rem)] flex-col overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-2xl shadow-slate-900/20">
          <header className="flex items-center justify-between bg-gradient-to-r from-emerald-600 to-teal-500 px-4 py-3 text-white">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/15 ring-1 ring-white/20">
                <FaChartLine />
              </div>
              <div className="min-w-0">
                <h2 className="truncate text-sm font-bold">Trợ lý phân tích</h2>
                <p className="truncate text-xs text-emerald-50">AI agent dữ liệu datamart</p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full text-white/90 transition hover:bg-white/15 hover:text-white"
              aria-label="Đóng cửa sổ chat"
              title="Đóng"
            >
              <FaTimes size={14} />
            </button>
          </header>

          <div ref={listRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-slate-50 p-4">
            {messages.map((item) => (
              <div
                key={item.id}
                className={`flex ${item.sender === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[82%] whitespace-pre-line rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm ${
                    item.sender === 'user'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-white text-slate-700 ring-1 ring-slate-200'
                  }`}
                >
                  {item.text}
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="flex justify-start">
                <div className="rounded-2xl bg-white px-4 py-2.5 text-sm text-slate-500 shadow-sm ring-1 ring-slate-200">
                  Đang phân tích...
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-2 pt-1">
              {quickPrompts.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => sendMessage(prompt)}
                  disabled={isLoading}
                  className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-emerald-700 shadow-sm ring-1 ring-emerald-100 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:text-slate-400"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>

          <form onSubmit={handleSubmit} className="flex items-center gap-2 border-t border-slate-200 bg-white p-3">
            <input
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Nhập câu hỏi phân tích..."
              className="min-w-0 flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-emerald-400 focus:bg-white focus:ring-4 focus:ring-emerald-100"
            />
            <button
              type="submit"
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white shadow-lg shadow-emerald-600/25 transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
              disabled={!message.trim() || isLoading}
              aria-label="Gửi tin nhắn"
              title="Gửi"
            >
              <FaPaperPlane size={14} />
            </button>
          </form>
        </section>
      )}

      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-2xl shadow-emerald-700/30 ring-4 ring-white transition hover:-translate-y-0.5 hover:shadow-emerald-700/40"
        aria-label={isOpen ? 'Thu nhỏ chatbot' : 'Mở chatbot phân tích'}
        title={isOpen ? 'Thu nhỏ' : 'Mở trợ lý phân tích'}
      >
        {isOpen ? <FaTimes size={20} /> : <FaRobot size={24} />}
      </button>
    </div>
  )
}