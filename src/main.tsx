import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { loadRemoteContent } from '@/lib/livecontent'
import './styles/index.css'

const root = createRoot(document.getElementById('root')!)
const render = () =>
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  )

// 先用构建期数据立刻渲染：网络再慢、云端再不可用，也不会白屏。
render()

// 再去云端取最新一期（内部 2.5 秒超时，这里再加一层硬兜底）。
// 拿到更新的内容就整体替换数据集并重新渲染 —— 每日出刊不需要重新部署站点。
const HARD_TIMEOUT = 4000
const guarded = Promise.race([
  loadRemoteContent(),
  new Promise<null>((resolve) => setTimeout(() => resolve(null), HARD_TIMEOUT)),
])

guarded.then((status) => {
  if (import.meta.env.DEV) {
    console.info('[内容来源]', status?.source ?? 'timeout', status?.date ?? '')
  }
  if (status?.source === 'cloud') render()
})
