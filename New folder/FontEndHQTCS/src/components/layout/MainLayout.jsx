import { Outlet } from 'react-router-dom'
import { InventoryAlertProvider } from '../../context/InventoryAlertContext'
import { PageHeaderProvider } from '../../context/PageHeaderContext'
import Sidebar from './Sidebar'
import Header from './Header'

export default function MainLayout() {
  return (
    <InventoryAlertProvider>
      <PageHeaderProvider>
        <div className="flex h-[100dvh] max-h-[100dvh] w-full flex-col overflow-hidden">
          <div className="flex min-h-0 flex-1 w-full overflow-hidden border-b border-slate-200/80 bg-white/80 shadow-sm backdrop-blur">
            <Sidebar />

            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              <Header />

              <main className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6 xl:p-8">
                <Outlet />
              </main>
            </div>
          </div>
        </div>
      </PageHeaderProvider>
    </InventoryAlertProvider>
  )
}