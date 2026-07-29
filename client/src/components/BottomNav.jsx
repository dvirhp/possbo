import { useState, useEffect, useRef, useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAppData } from '../context/DataProvider'
import { useTheme } from '../context/ThemeProvider'
import { useNavigationGuard } from '../context/NavigationGuard'
import {
  LayoutDashboard, SquarePen, Users, CalendarDays, BarChart3,
  LayoutTemplate, History, BookOpen, Settings, Moon, Sun, LogOut,
  Menu, X, Bell, Home, Sparkles, ChevronLeft, ChevronDown, CreditCard, MessageSquareHeart
} from 'lucide-react'
import NotificationSettings from './NotificationSettings'
import BrandLogo from './BrandLogo'
import '../styles/bottom-nav.css'

// Bottom nav order (RTL): תפריט | בית | [פרסום] | קמפיינים | טמפלייטים
const MAIN_ITEMS = [
  { id: 'menu', icon: Menu, label: 'תפריט', isMenu: true },
  { id: 'home', path: '/dashboard?tab=overview', match: '/dashboard', icon: Home, label: 'בית' },
  { id: 'publish', path: '/create-post', match: '/create-post', icon: null, label: 'פרסום', isCenter: true },
  { id: 'campaigns', path: '/dashboard?tab=campaigns', match: null, icon: SquarePen, label: 'קמפיינים', matchTab: 'campaigns' },
  { id: 'templates', path: '/templates', match: '/templates', icon: LayoutTemplate, label: 'טמפלייטים' },
]

const DRAWER_ITEMS = [
  { path: '/dashboard?tab=overview', icon: LayoutDashboard, label: 'דשבורד' },
  { path: '/dashboard?tab=groups', icon: Users, label: 'קבוצות' },
  { path: '/dashboard?tab=campaigns', icon: SquarePen, label: 'קמפיינים' },
  { path: '/scheduled', icon: CalendarDays, label: 'יומן' },
  { path: '/dashboard?tab=stats', icon: BarChart3, label: 'סטטיסטיקות' },
  { path: '/templates', icon: LayoutTemplate, label: 'טמפלייטים' },
  { path: '/reports', icon: History, label: 'דוחות וסיכום' },
  { path: '/generate-post', icon: Sparkles, label: 'יצירת פוסט בעזרת AI' },
  { path: '/feedback', icon: MessageSquareHeart, label: 'פידבק' },
]

export default function BottomNav() {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, logout } = useAppData()
  const { theme, setTheme } = useTheme()
  const { guardNavigate } = useNavigationGuard()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const [accountExpanded, setAccountExpanded] = useState(false)

  // Swipe left-to-right to open drawer (RTL: swipe from left edge)
  const touchStartX = useRef(0)
  const touchStartY = useRef(0)

  useEffect(() => {
    const handleTouchStart = (e) => {
      touchStartX.current = e.touches[0].clientX
      touchStartY.current = e.touches[0].clientY
    }
    const handleTouchEnd = (e) => {
      const dx = e.changedTouches[0].clientX - touchStartX.current
      const dy = Math.abs(e.changedTouches[0].clientY - touchStartY.current)
      // Swipe right (LTR direction) with start near left edge — opens RTL drawer
      if (dx > 80 && dy < 60 && touchStartX.current < 40) {
        setDrawerOpen(true)
      }
    }
    document.addEventListener('touchstart', handleTouchStart, { passive: true })
    document.addEventListener('touchend', handleTouchEnd, { passive: true })
    return () => {
      document.removeEventListener('touchstart', handleTouchStart)
      document.removeEventListener('touchend', handleTouchEnd)
    }
  }, [])

  const hiddenPaths = ['/', '/login', '/register', '/forgot-password', '/privacy', '/accessibility-statement', '/cancellation-policy', '/contact']
  if (hiddenPaths.includes(location.pathname)) return null

  const isActive = (item) => {
    if (item.isMenu) return false
    if (item.matchTab) {
      const params = new URLSearchParams(location.search)
      return location.pathname === '/dashboard' && params.get('tab') === item.matchTab
    }
    if (item.id === 'home') {
      const tab = new URLSearchParams(location.search).get('tab')
      return location.pathname === '/dashboard' && (!tab || tab === 'overview')
    }
    if (item.match) return location.pathname === item.match
    return false
  }

  const isDrawerActive = (item) => {
    const [path, query] = item.path.split('?')
    if (query) {
      const tab = new URLSearchParams(query).get('tab')
      const currentTab = new URLSearchParams(location.search).get('tab')
      return location.pathname === path && currentTab === tab
    }
    return location.pathname === path
  }

  return (
    <>
      {/* SVG gradient definition for active nav icons */}
      <svg width="0" height="0" style={{ position: 'absolute' }}>
        <defs>
          <linearGradient id="bnav-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="var(--indigo)" />
            <stop offset="100%" stopColor="var(--indigo)" />
          </linearGradient>
        </defs>
      </svg>

      <nav className="bottom-nav">
        <div className="bottom-nav-inner">
        {MAIN_ITEMS.map(item => {
          const Icon = item.icon
          if (item.isMenu) {
            return (
              <button
                key={item.id}
                className={`bottom-nav-item bottom-nav-menu ${drawerOpen ? 'active' : ''}`}
                onClick={() => setDrawerOpen(!drawerOpen)}
                aria-label={drawerOpen ? 'סגור תפריט' : 'פתח תפריט'}
                aria-expanded={drawerOpen}
                aria-controls="mobile-drawer"
              >
                <Icon size={22} strokeWidth={2} />
                <span className="bottom-nav-label">{item.label}</span>
              </button>
            )
          }
          if (item.isCenter) {
            return (
              <button
                key={item.id}
                className={`bottom-nav-item bottom-nav-center ${isActive(item) ? 'active' : ''}`}
                onClick={() => guardNavigate(() => { navigate(item.path); setDrawerOpen(false) })}
                aria-label={item.label}
                aria-current={isActive(item) ? 'page' : undefined}
              >
                <div className="bottom-nav-center-ring">
                  <BrandLogo decorative width="30" height="30" />
                </div>
                <span className="bottom-nav-label">{item.label}</span>
              </button>
            )
          }
          return (
            <button
              key={item.id}
              className={`bottom-nav-item ${isActive(item) ? 'active' : ''}`}
              onClick={() => guardNavigate(() => { navigate(item.path); setDrawerOpen(false) })}
              aria-label={item.label}
              aria-current={isActive(item) ? 'page' : undefined}
            >
              <Icon size={22} strokeWidth={2} />
              <span className="bottom-nav-label">{item.label}</span>
            </button>
          )
        })}
        </div>
      </nav>

      {/* Mobile Drawer */}
      {drawerOpen && <div className="mobile-drawer-overlay" onClick={() => setDrawerOpen(false)} />}
      <div className={`mobile-drawer ${drawerOpen ? 'open' : ''}`}>
        <div className="mobile-drawer-header">
          <div className="mobile-drawer-user">
            <div className="mobile-drawer-avatar">
              {user?.profileImage || user?.avatarUrl
                ? <img src={(() => { const v = user.profileImage || user.avatarUrl; if (v.startsWith('uploads/')) return `/${v}`; return v })()} alt="" onError={e => { e.target.style.display = 'none'; e.target.nextSibling && (e.target.nextSibling.style.display = '') }} />
                : <span>{user?.name?.[0] || '?'}</span>}
            </div>
            <div className="mobile-drawer-user-info">
              <span className="mobile-drawer-name">{user?.name || 'משתמש'}</span>
              <span className="mobile-drawer-email">{user?.email || ''}</span>
            </div>
          </div>
          <button className="mobile-drawer-close" onClick={() => setDrawerOpen(false)} aria-label="סגור תפריט">
            <X size={20} />
          </button>
        </div>
        <nav className="mobile-drawer-nav" id="mobile-drawer" aria-label="תפריט מובייל">
          {DRAWER_ITEMS.map(item => {
            const Icon = item.icon
            return (
              <button
                key={item.path}
                className={`mobile-drawer-item ${isDrawerActive(item) ? 'active' : ''}`}
                aria-current={isDrawerActive(item) ? 'page' : undefined}
                onClick={() => {
                  if (item.action === 'open-chatbot') {
                    window.dispatchEvent(new Event('open-chatbot'))
                    setDrawerOpen(false)
                  } else {
                    guardNavigate(() => { navigate(item.path); setDrawerOpen(false) })
                  }
                }}
              >
                <Icon size={20} strokeWidth={1.8} />
                <span>{item.label}</span>
              </button>
            )
          })}
        </nav>
        <div className="mobile-drawer-divider" />
        <div className="mobile-drawer-actions">
          <div className="mobile-drawer-expandable">
            <button className="mobile-drawer-item" onClick={() => setAccountExpanded(prev => !prev)} aria-expanded={accountExpanded}>
              <Settings size={20} strokeWidth={1.8} />
              <span>ניהול חשבון</span>
              {accountExpanded ? <ChevronDown size={16} className="mobile-drawer-chevron" /> : <ChevronLeft size={16} className="mobile-drawer-chevron" />}
            </button>
            {accountExpanded && (
              <div className="mobile-drawer-sub">
                <button className="mobile-drawer-sub-item" onClick={() => { navigate('/dashboard?tab=account'); setDrawerOpen(false); setAccountExpanded(false) }}>
                  <Settings size={18} strokeWidth={1.5} />
                  <span>הגדרות</span>
                </button>
                <button className="mobile-drawer-sub-item" onClick={() => { navigate('/subscription'); setDrawerOpen(false); setAccountExpanded(false) }}>
                  <CreditCard size={18} strokeWidth={1.5} />
                  <span>ניהול מנוי ותשלום</span>
                </button>
              </div>
            )}
          </div>
          <button className="mobile-drawer-item" onClick={() => { setNotifOpen(true); setDrawerOpen(false) }}>
            <Bell size={20} strokeWidth={1.8} />
            <span>התראות</span>
          </button>
          <button className="mobile-drawer-item" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
            {theme === 'dark' ? <Sun size={20} strokeWidth={1.8} /> : <Moon size={20} strokeWidth={1.8} />}
            <span>{theme === 'dark' ? 'עבור למצב בהיר' : 'עבור למצב כהה'}</span>
          </button>
          <button className="mobile-drawer-item logout" onClick={() => { logout(); navigate('/login'); setDrawerOpen(false) }}>
            <LogOut size={20} strokeWidth={1.8} />
            <span>התנתק</span>
          </button>
        </div>
      </div>
      <NotificationSettings open={notifOpen} onClose={() => setNotifOpen(false)} />
    </>
  )
}
