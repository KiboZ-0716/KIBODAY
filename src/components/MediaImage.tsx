type Props = {
  /** 形如 images/media/transit-lg.webp，会自动派生 md 档 */
  src: string
  alt: string
  sizes: string
  className?: string
  priority?: boolean
}

/**
 * 响应式图片：只把 -lg 档当成"基准路径"，srcset 里自动补上 md 档，
 * 小屏不会去拉 1400px 的大图。
 */
export function MediaImage({ src, alt, sizes, className, priority = false }: Props) {
  const base = src.replace(/-lg\.webp$/, '')
  const hasVariants = base !== src

  return (
    <img
      className={className}
      src={src}
      srcSet={
        hasVariants ? `${base}-md.webp 760w, ${base}-lg.webp 1400w` : undefined
      }
      sizes={hasVariants ? sizes : undefined}
      alt={alt}
      loading={priority ? 'eager' : 'lazy'}
      decoding={priority ? 'sync' : 'async'}
      fetchPriority={priority ? 'high' : 'auto'}
    />
  )
}
