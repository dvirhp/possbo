import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAppData } from '../context/DataProvider'
import { useTheme } from '../context/ThemeProvider'
import { useNavigationGuard } from '../context/NavigationGuard'
import { groupsService } from '../services/groupsService'
import NotificationSettings from './NotificationSettings'
import {
  LayoutDashboard, Users, FileText, CalendarDays, BarChart3,
  History, LayoutTemplate, Settings, Bell, SquarePen, Plus, RefreshCw, Sparkles,
  Moon, Sun, LogOut, ChevronDown, BookOpen
} from 'lucide-react'

const NAV_ITEMS = [
  { id: 'dashboard', icon: LayoutDashboard, label: 'דשבורד', action: 'navigate', path: '/dashboard', tab: 'overview' },
  { id: 'groups', icon: Users, label: 'קבוצות', action: 'navigate', path: '/dashboard', tab: 'groups' },
  { id: 'posts', icon: FileText, label: 'קמפיינים', action: 'navigate', path: '/dashboard', tab: 'campaigns' },
  { id: 'calendar', icon: CalendarDays, label: 'יומן', action: 'navigate', path: '/scheduled' },
  { id: 'analytics', icon: BarChart3, label: 'סטטיסטיקות', action: 'navigate', path: '/dashboard', tab: 'stats' },
  { id: 'templates', icon: LayoutTemplate, label: 'טמפלייטים', action: 'navigate', path: '/templates' },
  { id: 'history', icon: History, label: 'דוחות וסיכום', action: 'navigate', path: '/reports' },
  { id: 'guides', icon: BookOpen, label: 'עזרת AI', action: 'open-chatbot', path: '/guides' },
]

export default function Sidebar({ activeTab, onTabChange, mobileOpen }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, logout } = useAppData()
  const { theme, setTheme } = useTheme()
  const { guardNavigate } = useNavigationGuard()
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)

  const guardedNavigate = (...args) => {
    guardNavigate(() => navigate(...args))
  }

  const handleNav = (item) => {
    if (item.action === 'none') return
    if (item.action === 'open-chatbot') {
      window.dispatchEvent(new Event('open-chatbot'))
      return
    }
    guardNavigate(() => {
      if (item.path === '/dashboard' && item.tab) {
        onTabChange?.(item.id)
        navigate(`/dashboard?tab=${item.tab}`, { replace: location.pathname === '/dashboard' })
      } else if (item.path) {
        navigate(item.path)
      }
    })
  }

  const handleSyncGroups = () => {
    guardNavigate(() => {
      navigate('/dashboard?tab=groups', { replace: location.pathname === '/dashboard' })
      window.dispatchEvent(new CustomEvent('postit-sync-start', { detail: { msg: 'מסנכרן קבוצות מפייסבוק...' } }))
      groupsService.scrapeMyGroups().then(res => {
        if (res.data?.success) {
          window.dispatchEvent(new CustomEvent('postit-sync-done', { detail: { success: true, msg: `✅ סונכרנו ${res.data.groups?.length || 0} קבוצות!` } }))
        }
      }).catch(() => {
        window.dispatchEvent(new CustomEvent('postit-sync-done', { detail: { success: false, msg: '⚠️ שגיאה בסנכרון' } }))
      })
    })
  }

  return (
    <aside className={`sidebar ${mobileOpen ? 'mobile-open' : ''}`}>
      {/* Logo */}
      <div className="sidebar-logo" onClick={() => guardNavigate(() => { navigate('/dashboard?tab=overview'); onTabChange?.('dashboard') })}>
        <img src="/logo.svg" alt="PostIt" className="sidebar-logo-img" />
        <span className="sidebar-logo-text">PostIt</span>
      </div>

      {/* Main Navigation */}
      <nav className="sidebar-nav">
        {NAV_ITEMS.map(item => {
          const Icon = item.icon
          return (
            <button
              key={item.id}
              className={`sidebar-nav-item ${activeTab === item.id ? 'active' : ''} ${item.action === 'none' ? 'disabled' : ''}`}
              onClick={() => handleNav(item)}
              title={item.label}
            >
              <Icon size={20} strokeWidth={1.8} />
              <span>{item.label}</span>
            </button>
          )
        })}
      </nav>

      {/* Divider */}
      <div className="sidebar-divider" />

      {/* Quick Actions */}
      <div className="sidebar-section-title">פעולות מהירות</div>
      <div className="sidebar-quick-actions">
        <button className="sidebar-action-item sidebar-action-glow" onClick={() => guardedNavigate('/create-post')}>
          <span className="sidebar-action-icon"><SquarePen size={16} /></span>
          <span>צור קמפיין</span>
          <Plus size={16} className="sidebar-action-plus" />
        </button>
        <button className="sidebar-action-item" onClick={handleSyncGroups}>
          <span className="sidebar-action-icon"><RefreshCw size={16} /></span>
          <span>סנכרן קבוצות</span>
        </button>
        <button className="sidebar-action-item" onClick={() => window.dispatchEvent(new Event('open-chatbot'))}>
          <span className="sidebar-action-icon"><Sparkles size={16} /></span>
          <span>עזרת AI</span>
        </button>
      </div>

      {/* Bottom section */}
      <div className="sidebar-bottom">
        {/* User with dropdown */}
        <div className="sidebar-user-wrap">
          <button className="sidebar-user" onClick={() => setUserMenuOpen(!userMenuOpen)}>
            <div className="sidebar-user-avatar">
              {user?.profileImage || user?.avatarUrl
                ? <img src={(user.profileImage || user.avatarUrl).startsWith('/uploads') ? `http://localhost:8000${user.profileImage || user.avatarUrl}` : (user.profileImage || user.avatarUrl)} alt="" />
                : <span>{user?.name?.[0] || '?'}</span>}
            </div>
            <div className="sidebar-user-info">
              <span className="sidebar-user-name">{user?.name || 'משתמש'}</span>
            </div>
            <ChevronDown size={16} className="sidebar-user-chevron" />
          </button>

          {userMenuOpen && (
            <div className="sidebar-user-menu">
              <button onClick={() => { setUserMenuOpen(false); guardedNavigate('/dashboard?tab=settings') }}>
                👤 הצג פרופיל
              </button>
              <button onClick={() => { setUserMenuOpen(false); guardedNavigate('/dashboard?tab=settings') }}>
                ✏️ ערוך פרופיל
              </button>
              <button className="sidebar-menu-logout" onClick={() => { setUserMenuOpen(false); logout(); navigate('/login') }}>
                🚪 התנתק
              </button>
            </div>
          )}
        </div>

        {/* Bottom actions */}
        <div className="sidebar-bottom-actions">
          <button className="sidebar-bottom-btn" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} title={theme === 'dark' ? 'עבור למצב בהיר' : 'עבור למצב כהה'}>
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <button className="sidebar-bottom-btn" onClick={() => guardedNavigate('/dashboard?tab=settings')} title="הגדרות">
            <Settings size={18} />
          </button>
          <button className="sidebar-bottom-btn" title="התראות" onClick={() => setNotifOpen(true)}>
            <Bell size={18} />
          </button>
          <button className="sidebar-bottom-btn sidebar-logout-btn" onClick={() => { logout(); navigate('/login') }} title="התנתק">
            <LogOut size={18} />
          </button>
        </div>
      </div>
      <NotificationSettings open={notifOpen} onClose={() => setNotifOpen(false)} />
    </aside>
  )
}
