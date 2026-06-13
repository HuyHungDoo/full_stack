import AppRoutes from './routes/AppRoutes'
import { AppDialogProvider } from './context/AppDialogContext'

function App() {
  return (
    <AppDialogProvider>
      <AppRoutes />
    </AppDialogProvider>
  )
}

export default App