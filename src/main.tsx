import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { i18nReady } from './i18n'
import './styles.css'

// Render once the user's language is loaded, so the UI never flashes in English first.
i18nReady.finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
