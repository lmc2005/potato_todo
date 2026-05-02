import { useEffect } from 'react'

function normalizeDelta(event: WheelEvent) {
  if (event.deltaMode === 1) {
    return event.deltaY * 16
  }

  if (event.deltaMode === 2) {
    return event.deltaY * window.innerHeight
  }

  return event.deltaY
}

function hasNestedScrollableParent(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  let node = target.parentElement
  while (node && node !== document.body) {
    const style = window.getComputedStyle(node)
    const canScrollY = /(auto|scroll|overlay)/.test(style.overflowY) && node.scrollHeight > node.clientHeight + 1

    if (canScrollY) {
      return true
    }

    node = node.parentElement
  }

  return false
}

function isEditableTarget(target: EventTarget | null) {
  return target instanceof HTMLElement && Boolean(target.closest('input, textarea, select, [contenteditable="true"]'))
}

export function SmoothScroll() {
  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const finePointer = window.matchMedia('(pointer: fine)')

    if (prefersReducedMotion.matches || !finePointer.matches) {
      return
    }

    let animationFrame = 0
    let currentY = window.scrollY
    let targetY = window.scrollY
    let running = false

    const maxScrollY = () => Math.max(0, document.documentElement.scrollHeight - window.innerHeight)

    const animate = () => {
      currentY += (targetY - currentY) * 0.12

      if (Math.abs(targetY - currentY) < 0.45) {
        currentY = targetY
      }

      window.scrollTo({
        top: currentY,
        behavior: 'auto',
      })

      if (currentY !== targetY) {
        animationFrame = window.requestAnimationFrame(animate)
        return
      }

      running = false
      animationFrame = 0
    }

    const ensureAnimation = () => {
      if (running) {
        return
      }

      running = true
      animationFrame = window.requestAnimationFrame(animate)
    }

    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
        return
      }

      if (isEditableTarget(event.target) || hasNestedScrollableParent(event.target)) {
        return
      }

      event.preventDefault()

      currentY = window.scrollY
      targetY = Math.min(
        maxScrollY(),
        Math.max(0, targetY + normalizeDelta(event) * 0.92),
      )

      ensureAnimation()
    }

    const onScroll = () => {
      if (running) {
        return
      }

      currentY = window.scrollY
      targetY = window.scrollY
    }

    const onResize = () => {
      targetY = Math.min(targetY, maxScrollY())
      currentY = Math.min(currentY, maxScrollY())
    }

    window.addEventListener('wheel', onWheel, { passive: false })
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onResize)

    return () => {
      if (animationFrame) {
        window.cancelAnimationFrame(animationFrame)
      }

      window.removeEventListener('wheel', onWheel)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onResize)
    }
  }, [])

  return null
}
