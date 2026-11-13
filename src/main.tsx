import '@fontsource-variable/bricolage-grotesque'
import '@fontsource-variable/public-sans'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { ThemeProvider } from './app/theme.tsx'
import { UnitsProvider } from './app/units.tsx'
import { DataProvider } from './app/DataProvider.tsx'

// iOS Safari ignores user-scalable=no, so block its pinch gestures directly.
for (const type of ['gesturestart', 'gesturechange'] as const) {
  document.addEventListener(type, (e) => e.preventDefault(), { passive: false })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <UnitsProvider>
        <DataProvider>
          <BrowserRouter basename={import.meta.env.BASE_URL}>
            <App />
          </BrowserRouter>
        </DataProvider>
      </UnitsProvider>
    </ThemeProvider>
  </StrictMode>,
)
