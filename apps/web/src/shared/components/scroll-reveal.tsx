import type { ReactNode } from 'react'
import { useEffect, useRef, useState } from 'react'

import { cn } from '@/shared/lib/cn'

export function ScrollReveal({
  children,
  className,
  delayMs = 0,
  soft = false,
}: {
  children: ReactNode
  className?: string
  delayMs?: number
  soft?: boolean
}) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const node = ref.current
    if (!node) {
      return
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry) {
          return
        }
        if (entry.isIntersecting) {
          setVisible(true)
          observer.unobserve(entry.target)
        }
      },
      {
        threshold: 0.16,
        rootMargin: '0px 0px -8% 0px',
      },
    )

    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      className={cn(soft ? 'scroll-reveal-soft' : 'scroll-reveal', visible && 'scroll-reveal-visible', className)}
      style={{ transitionDelay: `${delayMs}ms` }}
    >
      {children}
    </div>
  )
}
