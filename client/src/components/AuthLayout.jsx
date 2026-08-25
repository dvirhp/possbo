import { useState, useEffect, useRef, useCallback } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useAppData } from '../context/DataProvider'
import Sidebar from './Sidebar'
import BottomNav from './BottomNav'
import PullToRefresh from './PullToRefresh'
import BrandLogo from './BrandLogo'

export default function AuthLayout({ children }) {
  const { user, authChecked } = useAppData()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const [activeTab, setActiveTab] = useState('dashboard')
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Swipe-to-open sidebar gesture
  const touchStartX = useRef(0)
  const touchStartY = useRef(0)
  const sidebarOpenRef = useRef(false)

  useEffect(() => { sidebarOpenRef.current = sidebarOpen }, [sidebarOpen])

  const handleSwipeStart = useCallback((e) => {
    if (window.innerWidth > 768) return
    touchStartX.current = e.touches[0].clientX
    touchStartY.current = e.touches[0].clientY
  }, [])

  const handleSwipeEnd = useCallback((e) => {
    if (window.innerWidth > 768) return
    const dx = e.changedTouches[0].clientX - touchStartX.current
    const dy = Math.abs(e.changedTouches[0].clientY - touchStartY.current)
    // Horizontal swipe must be dominant (dx > dy) and minimum 60px
    if (dy > Math.abs(dx) || Math.abs(dx) < 60) return
    // RTL: swipe left (negative dx) opens sidebar on right; swipe right closes
    if (dx < -60 && !sidebarOpenRef.current) {
      setSidebarOpen(true)
    } else if (dx > 60 && sidebarOpenRef.current) {
      setSidebarOpen(false)
    }
  }, [])

  useEffect(() => {
    document.addEventListener('touchstart', handleSwipeStart, { passive: true })
    document.addEventListener('touchend', handleSwipeEnd, { passive: true })
    return () => {
      document.removeEventListener('touchstart', handleSwipeStart)
      document.removeEventListener('touchend', handleSwipeEnd)
    }
  }, [handleSwipeStart, handleSwipeEnd])

  // Close sidebar on route change
  useEffect(() => { setSidebarOpen(false) }, [location])

  // Pull-to-refresh handler
  const handlePullRefresh = useCallback(() => {
    return new Promise(resolve => {
      const handler = () => { resolve(); window.removeEventListener('possbo-pull-refresh-done', handler) }
      window.addEventListener('possbo-pull-refresh-done', handler)
      window.dispatchEvent(new CustomEvent('possbo-pull-refresh'))
      // Auto-resolve after 3s if no one responds
      setTimeout(() => { resolve(); window.removeEventListener('possbo-pull-refresh-done', handler) }, 3000)
    })
  }, [])

  // Determine active tab from route
  useEffect(() => {
    const path = location.pathname
    if (path === '/dashboard') {
      const tab = searchParams.get('tab') || 'overview'
      if (tab === 'overview') setActiveTab('dashboard')
      else if (tab === 'campaigns') setActiveTab('posts')
      else if (tab === 'groups') setActiveTab('groups')
      else if (tab === 'stats') setActiveTab('analytics')
      else if (tab === 'posts') setActiveTab('history')
      else setActiveTab('dashboard')
    } else if (path === '/create-post') {
      setActiveTab('posts')
    } else if (path === '/scheduled') {
      setActiveTab('calendar')
    } else if (path.startsWith('/group/')) {
      setActiveTab('groups')
    } else if (path === '/templates' || path.startsWith('/templates/')) {
      setActiveTab('templates')
    } else if (path === '/reports') {
      setActiveTab('history')
    } else if (path === '/guides') {
      setActiveTab('guides')
    } else if (path === '/operations') {
      setActiveTab('operations')
    } else if (path === '/onboarding') {
      setActiveTab('onboarding')
    } else if (path === '/imports/csv') {
      setActiveTab('csv-import')
    }
  }, [location, searchParams])

  // Redirect to login if not authenticated
  useEffect(() => {
    if (authChecked && !user) {
      navigate('/login')
    } else if (authChecked && user && location.pathname === '/operations' && !user.isAdmin) {
      navigate('/dashboard', { replace: true })
    }
  }, [authChecked, user, navigate, location.pathname])

  // Enforce paywall: users without active subscription are blocked
  useEffect(() => {
    if (!authChecked || !user) return
    if (location.pathname === '/subscription') return
    const hasActiveSubscription = user.subscription && user.subscription.status === 'ACTIVE'
    if (!hasActiveSubscription) {
      navigate('/subscription', { replace: true })
    }
  }, [authChecked, user, location.pathname, navigate])

  if (!authChecked || (location.pathname === '/operations' && !user?.isAdmin)) {
    return (
      <div className="app-layout">
        <div className="app-main" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <BrandLogo decorative className="loader-logo-pulse" />
        </div>
      </div>
    )
  }

  if (!user) return null

  // Block render if user has no active subscription (paywall)
  const hasActiveSubscription = user.subscription && user.subscription.status === 'ACTIVE'
  if (!hasActiveSubscription && location.pathname !== '/subscription') {
    return null
  }

  // Subscription page gets a clean layout without sidebar/bottomnav
  if (location.pathname === '/subscription') {
    return <>{children}</>
  }

  return (
    <div className="app-layout">
      {sidebarOpen && <div className="mobile-sidebar-overlay" onClick={() => setSidebarOpen(false)} />}
      <Sidebar activeTab={activeTab} onTabChange={(tab) => {
        setActiveTab(tab)
        setSidebarOpen(false)
      }} mobileOpen={sidebarOpen} />
      <main className="app-main">
        <PullToRefresh onRefresh={handlePullRefresh}>
          {children}
        </PullToRefresh>
      </main>
      <BottomNav />
    </div>
  )
}
