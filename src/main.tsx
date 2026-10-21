import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './styles/tokens.css'
import './styles/base.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* BASE_URL follows vite's `base`, so routing works from a subpath. */}
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <App />
    </BrowserRouter>
  </StrictMode>,
)

// Lets Chrome install CRMO as an app. Production only: in dev a worker would
// sit between Vite and the browser.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, {
      scope: import.meta.env.BASE_URL,
    })
  })
}
