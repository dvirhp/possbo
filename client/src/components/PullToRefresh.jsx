import { useState, useRef, useCallback, useEffect } from 'react'

const THRESHOLD = 80

export default function PullToRefresh({ onRefresh, children }) {
  const [pulling, setPulling] = useState(false)
  const [pullDistance, setPullDistance] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const startY = useRef(0)
  const containerRef = useRef(null)

  const isMobile = () => window.innerWidth <= 768

  const handleTouchStart = useCallback((e) => {
    if (!isMobile()) return
    if (window.scrollY > 5) return
    startY.current = e.touches[0].clientY
    setPulling(true)
  }, [])

  const handleTouchMove = useCallback((e) => {
    if (!pulling || refreshing || !isMobile()) return
    if (window.scrollY > 5) { setPulling(false); setPullDistance(0); return }
    const diff = e.touches[0].clientY - startY.current
    if (diff > 0) {
      setPullDistance(Math.min(diff * 0.5, 120))
    }
  }, [pulling, refreshing])

  const handleTouchEnd = useCallback(async () => {
    if (!pulling || !isMobile()) return
    if (pullDistance >= THRESHOLD && onRefresh) {
      setRefreshing(true)
      setPullDistance(THRESHOLD)
      try { await onRefresh() } catch { /* ignore */ }
      setRefreshing(false)
    }
    setPulling(false)
    setPullDistance(0)
  }, [pulling, pullDistance, onRefresh])

  useEffect(() => {
    const el = document.body
    el.addEventListener('touchstart', handleTouchStart, { passive: true })
    el.addEventListener('touchmove', handleTouchMove, { passive: true })
    el.addEventListener('touchend', handleTouchEnd)
    return () => {
      el.removeEventListener('touchstart', handleTouchStart)
      el.removeEventListener('touchmove', handleTouchMove)
      el.removeEventListener('touchend', handleTouchEnd)
    }
  }, [handleTouchStart, handleTouchMove, handleTouchEnd])

  return (
    <>
      {(pullDistance > 0 || refreshing) && (
        <div className="ptr-indicator" style={{ height: refreshing ? THRESHOLD : pullDistance }}>
          <div className={`ptr-spinner ${refreshing ? 'ptr-spinning' : ''}`}
               style={{ opacity: Math.min(pullDistance / THRESHOLD, 1), transform: `rotate(${pullDistance * 3}deg)` }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
            </svg>
          </div>
        </div>
      )}
      <div ref={containerRef} style={{ transform: pullDistance > 0 && !refreshing ? `translateY(${pullDistance}px)` : undefined, transition: pulling ? 'none' : 'transform 0.3s ease' }}>
        {children}
      </div>
    </>
  )
}
