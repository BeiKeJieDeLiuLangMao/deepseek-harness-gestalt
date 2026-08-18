import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../../../packages/client/ui-theme/src/styles/base.css'
import '../../../../packages/client/ui-theme/src/styles/design-platform.css'
import '../../../../packages/client/ui-theme/src/styles/gradient-shadow-text.css'
import '../../../../packages/client/ui-theme/src/styles/scrollbar.css'
import { BrowserDockPrototype } from './prototype.tsx'
import './prototype.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserDockPrototype />
  </StrictMode>,
)
