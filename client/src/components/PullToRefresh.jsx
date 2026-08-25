import { useState, useRef, useCallback, useEffect } from 'react'
import BrandLogo from './BrandLogo'

const THRESHOLD = 55

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
    <div ref={containerRef} style={{ transition: pulling ? 'none' : 'all 0.3s ease' }}>
      {(pullDistance > 0 || refreshing) && (
        <div className="ptr-indicator" style={{ height: refreshing ? THRESHOLD : pullDistance }}>
          <div className={`ptr-spinner ${refreshing ? 'ptr-spinning' : ''}`}
               style={{ opacity: Math.min(pullDistance / THRESHOLD, 1) }}>
            <BrandLogo decorative className="ptr-logo" />
          </div>
        </div>
      )}
      {children}
    </div>
  )
}
