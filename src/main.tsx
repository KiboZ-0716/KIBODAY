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

// 再去取最新一期：每发现一个更新的内容包就立刻整体替换并重渲染，
// 不必等最慢的通道超时；每日出刊也不再依赖站点重新部署。
const HARD_TIMEOUT = 10000
const guarded = Promise.race([
  loadRemoteContent(() => render()),
  new Promise<null>((resolve) => setTimeout(() => resolve(null), HARD_TIMEOUT)),
])

guarded.then((status) => {
  if (import.meta.env.DEV) {
    console.info('[内容来源]', status?.source ?? 'timeout', status?.date ?? '')
  }
  if (status?.source === 'cloud') render()
})
