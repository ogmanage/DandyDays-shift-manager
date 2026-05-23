import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'

const LIFF_ID = import.meta.env.VITE_LIFF_ID as string | undefined

async function boot() {
  // LIFF コールバックURL（code= または liff.state= を含む）の場合、
  // LIFF SDKを先に初期化してURLを正しいルートに復元する
  if (LIFF_ID) {
    const qs = window.location.search
    if (qs.includes('liff.state') || qs.includes('code=')) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (window as any).liff?.init({ liffId: LIFF_ID })
      } catch {
        // 失敗しても続行（フォールバックで動作）
      }
    }
  }

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

boot()
