import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useNavigate, Link, useLocation } from 'react-router-dom'
import { useAppData } from '../context/DataProvider'
import { useTheme } from '../context/ThemeProvider'
import { groupsService } from '../services/groupsService'
import { authAPI } from '../services/api'
import ConfirmDialog from '../components/ConfirmDialog'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import DashboardOverview from '../components/DashboardOverview'
import '../styles/dashboard.css'
import '../styles/overview.css'

const TABS = [
  { id: 'campaigns', icon: '📅', label: 'קמפיינים' },
  { id: 'groups', icon: '👥', label: 'קבוצות' },
  { id: 'posts', icon: '📝', label: 'פרסומים' },
  { id: 'stats', icon: '📊', label: 'סטטיסטיקה' },
  { id: 'settings', icon: '⚙️', label: 'הגדרות' },
]

const NAV_ITEMS = [
  { id: 'campaigns', icon: 'calendar', label: 'קמפיינים' },
  { id: 'groups', icon: 'users', label: 'קבוצות' },
  { id: 'posts', icon: 'send', label: 'פרסומים' },
  { id: 'stats', icon: 'chart', label: 'סטטיסטיקה' },
  { id: 'settings', icon: 'settings', label: 'הגדרות' },
]

function NavIcon({ type }) {
  const icons = {
    calendar: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
    users: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>,
    send: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>,
    chart: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
    settings: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>,
  }
  return icons[type] || null
}

export default function Dashboard() {
  const navigate = useNavigate()
  const location = useLocation()
  const {
    user, setUser, authChecked, logout, ensureFresh, forceRefresh,
    campaigns, groups, jobs, posts, stats, dataReady,
    setStats, updateGroups, refreshing,
  } = useAppData()

  const [activeTab, setActiveTab] = useState(location.state?.tab || 'overview')
  const [search, setSearch] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [viewMode, setViewMode] = useState('list') // 'grid' | 'list'

  // Sync activeTab with location state changes (from Sidebar navigation)
  useEffect(() => {
    if (location.state?.tab) {
      setActiveTab(location.state.tab)
    }
  }, [location.state?.tab])

  // Filters
  const [statusFilter, setStatusFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [groupFilter, setGroupFilter] = useState('all')
  const [groupFilterOpen, setGroupFilterOpen] = useState(false)
  const [groupFilterSearch, setGroupFilterSearch] = useState('')
  const [sortBy, setSortBy] = useState('date')

  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [refreshingGroups, setRefreshingGroups] = useState(false)
  const [filterSheetOpen, setFilterSheetOpen] = useState(false)
  const [bootstrapping, setBootstrapping] = useState(false)
  const groupFilterRef = useRef(null)

  // Close group filter dropdown on outside click
  useEffect(() => {
    if (!groupFilterOpen) return
    const handler = (e) => {
      if (groupFilterRef.current && !groupFilterRef.current.contains(e.target)) {
        setGroupFilterOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [groupFilterOpen])

  // Redirect if not authed
  useEffect(() => {
    if (authChecked && !user) {
      navigate('/login')
    }
  }, [authChecked, user, navigate])

  // Refresh data in background on navigation
  useEffect(() => {
    ensureFresh()
  }, [location.key, ensureFresh])

  const loadStats = async () => {
    try {
      const params = {}
      if (dateFrom) params.from = dateFrom
      if (dateTo) params.to = dateTo
      const res = await groupsService.getStats(params)
      if (res.data.stats) setStats(res.data.stats)
    } catch { /* ignore */ }
  }

  useEffect(() => {
    if (activeTab === 'stats' && (dateFrom || dateTo)) {
      loadStats()
    }
  }, [dateFrom, dateTo])

  const handleLogout = async () => {
    setMainConfirm({
      title: 'התנתקות',
      message: 'האם אתה בטוח שברצונך להתנתק?',
      action: async () => {
        await logout()
        navigate('/')
      }
    })
  }

  const [mainConfirm, setMainConfirm] = useState(null)
  const [sessionRequired, setSessionRequired] = useState(false)
  const [overviewDetail, setOverviewDetail] = useState(null)
  const [overviewEditMode, setOverviewEditMode] = useState(false)

  const handleBootstrap = async () => {
    setBootstrapping(true)
    try {
      await groupsService.bootstrapSession()
      window.location.reload()
    } catch (err) {
      setBootstrapping(false)
      if (err.response?.data?.error === 'FACEBOOK_SESSION_NOT_COMPLETED') {
        window.alert('החיבור לא הושלם, יש להתחבר לפייסבוק בדפדפן שנפתח')
      }
    }
  }

  const handleRefreshGroups = async () => {
    setRefreshingGroups(true)
    setSessionRequired(false)
    window.dispatchEvent(new CustomEvent('postit-sync-start', { detail: { msg: 'מסנכרן קבוצות מפייסבוק... אפשר להמשיך לגלוש באתר' } }))
    try {
      const res = await groupsService.scrapeMyGroups()
      if (res.data.success && res.data.groups) {
        updateGroups(res.data.groups.map(g => ({
          id: g.id,
          name: g.name,
          image: g.image || null,
          url: g.url || `https://www.facebook.com/groups/${g.id}`,
          memberCount: g.memberCount || null,
          privacyType: g.privacyType || null,
        })))
        window.dispatchEvent(new CustomEvent('postit-sync-done', { detail: { success: true, msg: `✅ סונכרנו ${res.data.groups.length} קבוצות בהצלחה!` } }))
        // Refresh metadata silently in background
        groupsService.refreshGroupsMetadata().then(metaRes => {
          if (metaRes.data?.success) {
            groupsService.getSavedGroups().then(savedRes => {
              if (savedRes.data?.groups) updateGroups(savedRes.data.groups)
            }).catch(() => {})
          }
        }).catch(() => {})
      }
    } catch (err) {
      if (err.response?.status === 428) {
        setSessionRequired(true)
        // Update user state so the FB session banner appears
        setUser(prev => prev ? { ...prev, fbSessionValid: false } : prev)
        window.dispatchEvent(new CustomEvent('postit-sync-done', { detail: { success: false, msg: '⚠️ חיבור הפייסבוק פג תוקף — יש להתחבר מחדש' } }))
      } else {
        window.dispatchEvent(new CustomEvent('postit-sync-done', { detail: { success: false, msg: '⚠️ שגיאה בסנכרון הקבוצות' } }))
      }
    } finally {
      setRefreshingGroups(false)
    }
  }

  // Reset filters on tab change
  useEffect(() => {
    setSearch('')
    setStatusFilter('all')
    setGroupFilter('all')
    setGroupFilterOpen(false)
    setGroupFilterSearch('')
    setSortBy(activeTab === 'groups' ? 'name' : 'date')
    setFilterSheetOpen(false)
  }, [activeTab])

  const hasActiveFilters = statusFilter !== 'all' || groupFilter !== 'all' || sortBy !== 'date'

  const resetFilters = () => {
    setStatusFilter('all')
    setGroupFilter('all')
    setSortBy(activeTab === 'groups' ? 'name' : 'date')
    setFilterSheetOpen(false)
  }

  const filteredJobs = useMemo(() => {
    let list = jobs
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(j =>
        j.postGroup?.post?.content?.toLowerCase().includes(q) ||
        j.postGroup?.group?.name?.toLowerCase().includes(q)
      )
    }
    if (sortBy === 'date') {
      list = [...list].sort((a, b) => new Date(b.scheduledAt || 0) - new Date(a.scheduledAt || 0))
    } else if (sortBy === 'name') {
      list = [...list].sort((a, b) => (a.postGroup?.group?.name || '').localeCompare(b.postGroup?.group?.name || ''))
    }
    return list
  }, [jobs, search, sortBy])

  const filteredCampaigns = useMemo(() => {
    let list = campaigns
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(c =>
        c.content?.toLowerCase().includes(q) ||
        c.title?.toLowerCase().includes(q) ||
        c.groupNames?.some(n => n.toLowerCase().includes(q))
      )
    }
    if (statusFilter !== 'all') {
      list = list.filter(c => c.status === statusFilter)
    }

    if (groupFilter !== 'all') {
      list = list.filter(c => c.groupNames?.includes(groupFilter))
    }
    if (sortBy === 'date') {
      list = [...list].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
    } else if (sortBy === 'name') {
      list = [...list].sort((a, b) => (a.title || a.content || '').localeCompare(b.title || b.content || ''))
    }
    return list
  }, [campaigns, search, statusFilter, groupFilter, sortBy])

  const filteredGroups = useMemo(() => {
    let list = groups
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(g => g.name?.toLowerCase().includes(q))
    }
    if (sortBy === 'name') {
      list = [...list].sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    } else if (sortBy === 'members') {
      list = [...list].sort((a, b) => (b.memberCount || 0) - (a.memberCount || 0))
    }
    return list
  }, [groups, search, sortBy])

  const filteredPosts = useMemo(() => {
    let list = posts
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(p =>
        p.post?.content?.toLowerCase().includes(q) ||
        p.group?.name?.toLowerCase().includes(q)
      )
    }
    if (statusFilter !== 'all') {
      list = list.filter(p => p.status === statusFilter)
    }
    if (groupFilter !== 'all') {
      list = list.filter(p => p.group?.name === groupFilter)
    }
    if (sortBy === 'date') {
      list = [...list].sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0))
    }
    return list
  }, [posts, search, statusFilter, groupFilter, sortBy])

  // Unique group names from posts for the group filter
  const postGroupNames = useMemo(() => {
    const names = [...new Set(posts.map(p => p.group?.name).filter(Boolean))]
    return names.sort((a, b) => a.localeCompare(b))
  }, [posts])

  // Unique group names from campaigns
  const campaignGroupNames = useMemo(() => {
    const names = [...new Set(campaigns.flatMap(c => c.groupNames || []).filter(Boolean))]
    return names.sort((a, b) => a.localeCompare(b))
  }, [campaigns])

  // Filter counts for campaigns
  const campaignStatusCounts = useMemo(() => {
    const counts = {}
    campaigns.forEach(c => { counts[c.status] = (counts[c.status] || 0) + 1 })
    return counts
  }, [campaigns])

  const campaignTypeCounts = useMemo(() => {
    const counts = {}
    campaigns.forEach(c => { counts[c.campaignType] = (counts[c.campaignType] || 0) + 1 })
    return counts
  }, [campaigns])

  const campaignGroupCounts = useMemo(() => {
    const counts = {}
    campaigns.forEach(c => {
      (c.groupNames || []).forEach(name => { counts[name] = (counts[name] || 0) + 1 })
    })
    return counts
  }, [campaigns])

  // Filter counts for posts
  const postStatusCounts = useMemo(() => {
    const counts = {}
    posts.forEach(p => { counts[p.status] = (counts[p.status] || 0) + 1 })
    return counts
  }, [posts])

  const postGroupCounts = useMemo(() => {
    const counts = {}
    posts.forEach(p => {
      if (p.group?.name) counts[p.group.name] = (counts[p.group.name] || 0) + 1
    })
    return counts
  }, [posts])

  const tabCounts = {
    campaigns: campaigns.length,
    groups: groups.length,
    posts: posts.length,
    stats: stats?.publishedCount || 0,
    settings: null,
  }

  const kpiData = {
    campaigns: campaigns.length,
    published: posts.length,
    groups: groups.length,
  }

  return (
    <>
    <div className="dash">
      {/* Mobile overlay */}
      {mobileMenuOpen && <div className="mobile-overlay" onClick={() => setMobileMenuOpen(false)} />}

      {/* ─── SIDEBAR ─── */}
      <aside className={`dash-sidebar ${sidebarOpen ? 'open' : 'collapsed'} ${mobileMenuOpen ? 'mobile-open' : ''}`}>
        <div className="sidebar-top">
          <Link to="/dashboard" className="sidebar-logo" onClick={() => setMobileMenuOpen(false)}>
            <img src="/logo.svg" alt="PostIt" className="sidebar-logo-img" />
            {sidebarOpen && <span className="sidebar-logo-text">PostIt</span>}
          </Link>
        </div>

        <nav className="sidebar-nav">
          {sidebarOpen && <div className="sidebar-section-label">ניהול</div>}
          {NAV_ITEMS.map(item => (
            <button
              key={item.id}
              type="button"
              className={`sidebar-item ${activeTab === item.id ? 'active' : ''}`}
              onClick={() => { setActiveTab(item.id); setMobileMenuOpen(false) }}
              title={item.label}
            >
              <NavIcon type={item.icon} />
              {sidebarOpen && <span className="sidebar-item-label">{item.label}</span>}
              {sidebarOpen && tabCounts[item.id] != null && tabCounts[item.id] > 0 && (
                <span className="sidebar-badge">{tabCounts[item.id]}</span>
              )}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          {sidebarOpen && user && (
            <div className="sidebar-user">
              <div className="sidebar-avatar">
                {user.name?.charAt(0) || user.email?.charAt(0) || '?'}
              </div>
              <div className="sidebar-user-info">
                <span className="sidebar-user-name">{user.name || user.email}</span>
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* ─── MAIN ─── */}
      <div className="dash-main">
        {/* Top Bar */}
        <header className="dash-topbar">
          <div className="topbar-right">
            <button className="topbar-toggle" onClick={() => {
              // On mobile (<=768px) toggle mobile menu, on desktop toggle sidebar
              if (window.innerWidth <= 768) {
                setMobileMenuOpen(!mobileMenuOpen)
              } else {
                setSidebarOpen(!sidebarOpen)
              }
            }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/>
              </svg>
            </button>
            <Link to="/dashboard" className="topbar-title-link">
              <h1 className="topbar-title">דשבורד</h1>
            </Link>
          </div>
          <div className="topbar-left">
            <Link to="/scheduled" className="topbar-cta-secondary">
              📅 <span className="topbar-cta-label">יומן תזמונים</span>
            </Link>
            <Link to="/create-post" className="topbar-cta">
              <span>+</span> <span className="topbar-cta-label">קמפיין חדש</span>
            </Link>
            <button onClick={handleLogout} className="topbar-logout" title="התנתק">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
            </button>
          </div>
        </header>

        {/* Content */}
        <div className="dash-body">
          {(!authChecked || !dataReady) ? (
            <div className="dash-loader">
              <div className="loader-pulse"><div/><div/><div/></div>
            </div>
          ) : (
            <>
              {/* Facebook session banner */}
              {user && !user.fbSessionValid && !refreshing && (
                <div className="session-banner">
                  <span>⚠️ חשבון הפייסבוק לא מחובר, פוסטים מתוזמנים לא יפורסמו</span>
                  <button className="session-banner-btn" disabled={bootstrapping} onClick={handleBootstrap}>
                    {bootstrapping ? '⏳ ממתין לחיבור...' : '🔗 חבר עכשיו'}
                  </button>
                </div>
              )}

              {/* KPIs — always visible except stats/settings */}
              {activeTab !== 'settings' && activeTab !== 'stats' && activeTab !== 'overview' && (
                <section className="kpi-row">
                  <div className={`kpi-card kpi-clickable ${activeTab === 'campaigns' ? 'kpi-active' : ''}`} onClick={() => setActiveTab('campaigns')}>
                    <div className="kpi-card-icon kpi-indigo">
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                        <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                      </svg>
                    </div>
                    <div className="kpi-card-data">
                      <span className="kpi-card-number">{kpiData.campaigns}</span>
                      <span className="kpi-card-label">קמפיינים מתוזמנים</span>
                    </div>
                  </div>
                  <div className={`kpi-card kpi-clickable ${activeTab === 'posts' ? 'kpi-active' : ''}`} onClick={() => setActiveTab('posts')}>
                    <div className="kpi-card-icon kpi-emerald">
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                        <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
                      </svg>
                    </div>
                    <div className="kpi-card-data">
                      <span className="kpi-card-number">{kpiData.published}</span>
                      <span className="kpi-card-label">פוסטים שפורסמו</span>
                    </div>
                  </div>
                  <div className={`kpi-card kpi-clickable ${activeTab === 'groups' ? 'kpi-active' : ''}`} onClick={() => setActiveTab('groups')}>
                    <div className="kpi-card-icon kpi-violet">
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/>
                      </svg>
                    </div>
                    <div className="kpi-card-data">
                      <span className="kpi-card-number">{kpiData.groups}</span>
                      <span className="kpi-card-label">קבוצות פייסבוק</span>
                    </div>
                  </div>
                </section>
              )}

              {/* ─── FILTER BAR ─── */}
              {activeTab !== 'settings' && activeTab !== 'stats' && activeTab !== 'overview' && (
                <div className="filter-bar">
                  <div className="filter-bar-search">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                    </svg>
                    <input
                      type="text"
                      placeholder={`חיפוש ${TABS.find(t => t.id === activeTab)?.label || ''}...`}
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                    />
                    {search && (
                      <button className="search-clear" onClick={() => setSearch('')}>✕</button>
                    )}
                  </div>

                  {/* Mobile filter button */}
                  <button
                    className={`filter-sheet-trigger ${hasActiveFilters ? 'active' : ''}`}
                    onClick={() => setFilterSheetOpen(true)}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
                    </svg>
                    סינון
                    {hasActiveFilters && <span className="filter-badge-dot" />}
                  </button>

                  {/* Desktop filter controls (hidden on mobile) */}
                  <div className="filter-bar-controls">
                    {activeTab === 'campaigns' && (
                      <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="filter-select">
                        <option value="all">כל הסטטוסים ({campaigns.length})</option>
                        {campaignStatusCounts['active'] && <option value="active">פעיל ({campaignStatusCounts['active']})</option>}
                        {campaignStatusCounts['scheduled'] && <option value="scheduled">מתוזמן ({campaignStatusCounts['scheduled']})</option>}
                        {campaignStatusCounts['recurring'] && <option value="recurring">חוזר ({campaignStatusCounts['recurring']})</option>}
                        {campaignStatusCounts['paused'] && <option value="paused">מושהה ({campaignStatusCounts['paused']})</option>}
                        {campaignStatusCounts['draft'] && <option value="draft">טיוטה ({campaignStatusCounts['draft']})</option>}
                        {campaignStatusCounts['one-time'] && <option value="one-time">חד-פעמי ({campaignStatusCounts['one-time']})</option>}
                      </select>
                    )}



                    {activeTab === 'campaigns' && campaignGroupNames.length > 1 && (
                      <div className="group-filter-wrap" ref={groupFilterRef}>
                        <button
                          className={`filter-select group-filter-btn ${groupFilter !== 'all' ? 'active' : ''}`}
                          onClick={() => setGroupFilterOpen(!groupFilterOpen)}
                        >
                          {groupFilter === 'all' ? `👥 כל הקבוצות (${campaigns.length})` : `👥 ${groupFilter} (${campaignGroupCounts[groupFilter] || 0})`}
                        </button>
                        {groupFilterOpen && (
                          <div className="group-filter-dropdown">
                            <div className="group-filter-search">
                              <input
                                type="text"
                                placeholder="חפש קבוצה..."
                                value={groupFilterSearch}
                                onChange={e => setGroupFilterSearch(e.target.value)}
                                autoFocus
                              />
                            </div>
                            <div className="group-filter-list">
                              <button
                                className={`group-filter-item ${groupFilter === 'all' ? 'active' : ''}`}
                                onClick={() => { setGroupFilter('all'); setGroupFilterOpen(false); setGroupFilterSearch('') }}
                              >
                                כל הקבוצות ({campaigns.length})
                              </button>
                              {campaignGroupNames
                                .filter(name => !groupFilterSearch || name.toLowerCase().includes(groupFilterSearch.toLowerCase()))
                                .map(name => (
                                  <button
                                    key={name}
                                    className={`group-filter-item ${groupFilter === name ? 'active' : ''}`}
                                    onClick={() => { setGroupFilter(name); setGroupFilterOpen(false); setGroupFilterSearch('') }}
                                  >
                                    {name} ({campaignGroupCounts[name] || 0})
                                  </button>
                                ))
                              }
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {activeTab === 'posts' && (
                      <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="filter-select">
                        <option value="all">כל הסטטוסים ({posts.length})</option>
                        {postStatusCounts['SUCCESS'] && <option value="SUCCESS">פורסם ({postStatusCounts['SUCCESS']})</option>}
                        {postStatusCounts['FAILED'] && <option value="FAILED">נכשל ({postStatusCounts['FAILED']})</option>}
                        {postStatusCounts['PENDING'] && <option value="PENDING">ממתין ({postStatusCounts['PENDING']})</option>}
                      </select>
                    )}

                    {activeTab === 'posts' && postGroupNames.length > 1 && (
                      <div className="group-filter-wrap" ref={groupFilterRef}>
                        <button
                          className={`filter-select group-filter-btn ${groupFilter !== 'all' ? 'active' : ''}`}
                          onClick={() => setGroupFilterOpen(!groupFilterOpen)}
                        >
                          {groupFilter === 'all' ? `👥 כל הקבוצות (${posts.length})` : `👥 ${groupFilter} (${postGroupCounts[groupFilter] || 0})`}
                        </button>
                        {groupFilterOpen && (
                          <div className="group-filter-dropdown">
                            <div className="group-filter-search">
                              <input
                                type="text"
                                placeholder="חפש קבוצה..."
                                value={groupFilterSearch}
                                onChange={e => setGroupFilterSearch(e.target.value)}
                                autoFocus
                              />
                            </div>
                            <div className="group-filter-list">
                              <button
                                className={`group-filter-item ${groupFilter === 'all' ? 'active' : ''}`}
                                onClick={() => { setGroupFilter('all'); setGroupFilterOpen(false); setGroupFilterSearch('') }}
                              >
                                כל הקבוצות ({posts.length})
                              </button>
                              {postGroupNames
                                .filter(name => !groupFilterSearch || name.toLowerCase().includes(groupFilterSearch.toLowerCase()))
                                .map(name => (
                                  <button
                                    key={name}
                                    className={`group-filter-item ${groupFilter === name ? 'active' : ''}`}
                                    onClick={() => { setGroupFilter(name); setGroupFilterOpen(false); setGroupFilterSearch('') }}
                                  >
                                    {name} ({postGroupCounts[name] || 0})
                                  </button>
                                ))
                              }
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    <select value={sortBy} onChange={e => setSortBy(e.target.value)} className="filter-select">
                      {activeTab !== 'groups' && <option value="date">מיון לפי תאריך</option>}
                      <option value="name">מיון לפי שם</option>
                      {activeTab === 'groups' && <option value="members">מיון לפי חברים</option>}
                    </select>
                  </div>

                  {/* Groups refresh button */}
                  {activeTab === 'groups' && (
                    <button onClick={handleRefreshGroups} disabled={refreshingGroups} className="refresh-groups-btn">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={refreshingGroups ? 'spin' : ''}>
                        <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
                      </svg>
                      {refreshingGroups ? 'מסנכרן...' : 'רענן קבוצות'}
                    </button>
                  )}

                  {/* View toggle */}
                  {(activeTab === 'campaigns' || activeTab === 'posts' || activeTab === 'groups') && (
                    <div className="view-toggle-bar">
                      <button className={`view-toggle-btn ${viewMode === 'grid' ? 'active' : ''}`} onClick={() => setViewMode('grid')} title="תצוגת ריבועים">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
                      </button>
                      <button className={`view-toggle-btn ${viewMode === 'list' ? 'active' : ''}`} onClick={() => setViewMode('list')} title="תצוגת שורות">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* ─── MOBILE FILTER SHEET ─── */}
              {filterSheetOpen && (
                <>
                  <div className="filter-sheet-overlay" onClick={() => setFilterSheetOpen(false)} />
                  <div className="filter-sheet">
                    <div className="filter-sheet-handle" />
                    <h3 className="filter-sheet-title">סינון ומיון</h3>

                    {/* Status filter */}
                    {(activeTab === 'campaigns' || activeTab === 'posts') && (
                      <div className="filter-sheet-section">
                        <label className="filter-sheet-label">סטטוס</label>
                        <div className="filter-sheet-chips">
                          {activeTab === 'campaigns' && [
                            { value: 'all', label: 'הכל', count: campaigns.length },
                            { value: 'active', label: 'פעיל', count: campaignStatusCounts['active'] },
                            { value: 'scheduled', label: 'מתוזמן', count: campaignStatusCounts['scheduled'] },
                            { value: 'recurring', label: 'חוזר', count: campaignStatusCounts['recurring'] },
                            { value: 'paused', label: 'מושהה', count: campaignStatusCounts['paused'] },
                            { value: 'draft', label: 'טיוטה', count: campaignStatusCounts['draft'] },
                            { value: 'one-time', label: 'חד-פעמי', count: campaignStatusCounts['one-time'] },
                          ].filter(opt => opt.value === 'all' || opt.count > 0).map(opt => (
                            <button
                              key={opt.value}
                              className={`filter-chip ${statusFilter === opt.value ? 'active' : ''}`}
                              onClick={() => setStatusFilter(opt.value)}
                            >
                              {opt.label} ({opt.count})
                            </button>
                          ))}
                          {activeTab === 'posts' && [
                            { value: 'all', label: 'הכל', count: posts.length },
                            { value: 'SUCCESS', label: 'פורסם', count: postStatusCounts['SUCCESS'] },
                            { value: 'FAILED', label: 'נכשל', count: postStatusCounts['FAILED'] },
                            { value: 'PENDING', label: 'ממתין', count: postStatusCounts['PENDING'] },
                          ].filter(opt => opt.value === 'all' || opt.count > 0).map(opt => (
                            <button
                              key={opt.value}
                              className={`filter-chip ${statusFilter === opt.value ? 'active' : ''}`}
                              onClick={() => setStatusFilter(opt.value)}
                            >
                              {opt.label} ({opt.count})
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Group filter for campaigns */}
                    {activeTab === 'campaigns' && campaignGroupNames.length > 1 && (
                      <div className="filter-sheet-section">
                        <label className="filter-sheet-label">קבוצה</label>
                        <div className="filter-sheet-group-search">
                          <input
                            type="text"
                            placeholder="חפש קבוצה..."
                            value={groupFilterSearch}
                            onChange={e => setGroupFilterSearch(e.target.value)}
                          />
                        </div>
                        <div className="filter-sheet-chips filter-sheet-groups">
                          <button
                            className={`filter-chip ${groupFilter === 'all' ? 'active' : ''}`}
                            onClick={() => { setGroupFilter('all'); setGroupFilterSearch('') }}
                          >
                            כל הקבוצות ({campaigns.length})
                          </button>
                          {campaignGroupNames
                            .filter(name => !groupFilterSearch || name.toLowerCase().includes(groupFilterSearch.toLowerCase()))
                            .map(name => (
                              <button
                                key={name}
                                className={`filter-chip ${groupFilter === name ? 'active' : ''}`}
                                onClick={() => { setGroupFilter(name); setGroupFilterSearch('') }}
                              >
                                {name} ({campaignGroupCounts[name] || 0})
                              </button>
                            ))
                          }
                        </div>
                      </div>
                    )}

                    {/* Group filter for posts */}
                    {activeTab === 'posts' && postGroupNames.length > 1 && (
                      <div className="filter-sheet-section">
                        <label className="filter-sheet-label">קבוצה</label>
                        <div className="filter-sheet-group-search">
                          <input
                            type="text"
                            placeholder="חפש קבוצה..."
                            value={groupFilterSearch}
                            onChange={e => setGroupFilterSearch(e.target.value)}
                          />
                        </div>
                        <div className="filter-sheet-chips filter-sheet-groups">
                          <button
                            className={`filter-chip ${groupFilter === 'all' ? 'active' : ''}`}
                            onClick={() => { setGroupFilter('all'); setGroupFilterSearch('') }}
                          >
                            כל הקבוצות ({posts.length})
                          </button>
                          {postGroupNames
                            .filter(name => !groupFilterSearch || name.toLowerCase().includes(groupFilterSearch.toLowerCase()))
                            .map(name => (
                              <button
                                key={name}
                                className={`filter-chip ${groupFilter === name ? 'active' : ''}`}
                                onClick={() => { setGroupFilter(name); setGroupFilterSearch('') }}
                              >
                                {name} ({postGroupCounts[name] || 0})
                              </button>
                            ))
                          }
                        </div>
                      </div>
                    )}

                    {/* Sort */}
                    <div className="filter-sheet-section">
                      <label className="filter-sheet-label">מיון</label>
                      <div className="filter-sheet-chips">
                        <button className={`filter-chip ${sortBy === 'date' ? 'active' : ''}`} onClick={() => setSortBy('date')}>תאריך</button>
                        <button className={`filter-chip ${sortBy === 'name' ? 'active' : ''}`} onClick={() => setSortBy('name')}>שם</button>
                        {activeTab === 'groups' && (
                          <button className={`filter-chip ${sortBy === 'members' ? 'active' : ''}`} onClick={() => setSortBy('members')}>חברים</button>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="filter-sheet-actions">
                      <button className="filter-sheet-reset" onClick={resetFilters}>
                        אפס סינון
                      </button>
                      <button className="filter-sheet-apply" onClick={() => setFilterSheetOpen(false)}>
                        החל
                      </button>
                    </div>
                  </div>
                </>
              )}

              {/* Panel */}
              <div className="dash-panel">
                {activeTab === 'overview' && <DashboardOverview campaigns={campaigns} groups={groups} posts={posts} jobs={jobs} stats={stats} user={user} onUpdate={forceRefresh} onViewCampaign={(c, edit) => { setOverviewDetail(c); setOverviewEditMode(!!edit) }} />}
                {activeTab === 'campaigns' && <CampaignsPanel campaigns={filteredCampaigns} navigate={navigate} groups={groups} onUpdate={forceRefresh} viewMode={viewMode} />}
                {activeTab === 'groups' && <GroupsPanel groups={filteredGroups} navigate={navigate} sessionRequired={sessionRequired} viewMode={viewMode} />}
                {activeTab === 'posts' && <PostsPanel posts={filteredPosts} navigate={navigate} groups={groups} onUpdate={forceRefresh} viewMode={viewMode} />}
                {activeTab === 'stats' && (
                  <StatsPanel stats={stats} dateFrom={dateFrom} dateTo={dateTo}
                    setDateFrom={setDateFrom} setDateTo={setDateTo} onFilter={loadStats} />
                )}
                {activeTab === 'settings' && <SettingsPanel user={user} logout={logout} setUser={setUser} navigate={navigate} handleBootstrap={handleBootstrap} bootstrapping={bootstrapping} />}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ─── MOBILE BOTTOM NAV ─── */}
      <nav className="dash-mobile-nav">
        {NAV_ITEMS.map(item => (
          <button
            key={item.id}
            type="button"
            className={`mobile-nav-item ${activeTab === item.id ? 'active' : ''}`}
            onClick={() => setActiveTab(item.id)}
          >
            <NavIcon type={item.icon} />
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
    <ConfirmDialog
      open={!!mainConfirm}
      title={mainConfirm?.title}
      message={mainConfirm?.message}
      onConfirm={() => { mainConfirm?.action(); setMainConfirm(null) }}
      onCancel={() => setMainConfirm(null)}
    />
    {overviewDetail && (
      <CampaignDetailModal
        campaign={overviewDetail}
        onClose={() => { setOverviewDetail(null); setOverviewEditMode(false) }}
        groups={groups}
        initialEditing={overviewEditMode}
        onSave={async (data, imgs) => {
          try {
            await groupsService.updateCampaign(overviewDetail.id, data, imgs)
            setOverviewDetail(null)
            setOverviewEditMode(false)
            forceRefresh()
          } catch { /* ignore */ }
        }}
        onPause={async () => {
          try {
            await groupsService.togglePause(overviewDetail.id)
            setOverviewDetail(null)
            forceRefresh()
          } catch { /* ignore */ }
        }}
        onDuplicate={async () => {
          try {
            await groupsService.duplicateCampaign(overviewDetail.id)
            setOverviewDetail(null)
            forceRefresh()
          } catch { /* ignore */ }
        }}
        onDelete={() => {
          setOverviewDetail(null)
          setMainConfirm({
            title: 'מחיקת קמפיין',
            message: 'האם אתה בטוח שברצונך למחוק? פעולה זו לא ניתנת לביטול.',
            action: async () => {
              try {
                await groupsService.deleteCampaign(overviewDetail.id)
                forceRefresh()
              } catch { /* ignore */ }
            }
          })
        }}
      />
    )}
    </>
  )
}

// ─── PANELS ─────────────────────────────────────────────

function CampaignsPanel({ campaigns, navigate, groups, onUpdate, viewMode }) {
  const [tooltipId, setTooltipId] = useState(null)
  const [menuId, setMenuId] = useState(null)
  const [editCampaign, setEditCampaign] = useState(null)
  const [detailCampaign, setDetailCampaign] = useState(null)
  const [loading, setLoading] = useState(false)
  const [localCampaigns, setLocalCampaigns] = useState(campaigns)
  const [confirmAction, setConfirmAction] = useState(null)
  const menuRef = useRef(null)

  useEffect(() => { setLocalCampaigns(campaigns) }, [campaigns])

  // Close tooltip on outside click (mobile)
  useEffect(() => {
    if (!tooltipId) return
    const close = () => setTooltipId(null)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [tooltipId])

  const STATUS_LABELS = {
    scheduled: 'מתוזמן',
    paused: 'מושהה',
    draft: 'טיוטה',
    recurring: 'חוזר',
    active: 'פעיל',
    'one-time': 'חד-פעמי',
  }

  const STATUS_CLASSES = {
    scheduled: 'badge-scheduled',
    paused: 'badge-paused',
    draft: 'badge-draft',
    recurring: 'badge-recurring',
    active: 'badge-active',
    'one-time': 'badge-onetime',
  }

  const DAY_NAMES = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳']

  useEffect(() => {
    if (!menuId) return
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuId(null)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuId])

  const handlePause = async (campaign) => {
    setMenuId(null)
    const wasPaused = campaign.isPaused
    setLocalCampaigns(prev => prev.map(c => c.id === campaign.id
      ? { ...c, isPaused: !wasPaused, status: wasPaused ? (c.campaignType === 'RECURRING' ? 'recurring' : 'scheduled') : 'paused' }
      : c
    ))
    try {
      await groupsService.togglePause(campaign.id)
      onUpdate()
    } catch {
      setLocalCampaigns(prev => prev.map(c => c.id === campaign.id
        ? { ...c, isPaused: wasPaused, status: campaign.status }
        : c
      ))
    }
  }

  const handleDelete = async (campaign) => {
    setMenuId(null)
    setConfirmAction({
      title: 'מחיקת קמפיין',
      message: 'האם אתה בטוח שברצונך למחוק את הקמפיין? פעולה זו לא ניתנת לביטול.',
      action: async () => {
        setLocalCampaigns(prev => prev.filter(c => c.id !== campaign.id))
        try {
          await groupsService.deleteCampaign(campaign.id)
          onUpdate()
        } catch {
          setLocalCampaigns(prev => [...prev, campaign])
        }
      }
    })
  }

  const handleDuplicate = async (campaign) => {
    setMenuId(null)
    const tempId = 'temp-' + Date.now()
    const duplicate = { ...campaign, id: tempId, title: (campaign.title || '') + ' (עותק)', status: 'draft', isPaused: true }
    setLocalCampaigns(prev => [duplicate, ...prev])
    try {
      await groupsService.duplicateCampaign(campaign.id)
      onUpdate()
    } catch {
      setLocalCampaigns(prev => prev.filter(c => c.id !== tempId))
    }
  }

  const handleEdit = async (campaign) => {
    setMenuId(null)
    try {
      const res = await groupsService.getCampaign(campaign.id)
      setEditCampaign(res.data.campaign)
    } catch { /* ignore */ }
  }

  const handleRestart = (campaign) => {
    setMenuId(null)
    handleEdit(campaign)
  }

  const handleEditSave = async (idOrData, dataOrImages, maybeImages) => {
    // Support both: handleEditSave(data, images) and handleEditSave(id, data, images)
    let id, data, images
    if (typeof idOrData === 'string') {
      id = idOrData; data = dataOrImages; images = maybeImages
    } else {
      id = editCampaign?.id; data = idOrData; images = dataOrImages
    }
    setLoading(true)
    try {
      await groupsService.updateCampaign(id, data, images)
      setEditCampaign(null)
      onUpdate()
    } catch { /* ignore */ }
    setLoading(false)
  }

  if (!localCampaigns.length) return (
    <div className="empty-state">
      <div className="empty-icon-wrap">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
        </svg>
      </div>
      <h3>אין קמפיינים</h3>
      <p>צור קמפיין חדש כדי להתחיל לפרסם אוטומטית</p>
      <Link to="/create-post" className="empty-btn">+ צור קמפיין ראשון</Link>
    </div>
  )

  return (
    <>
    <div className={`campaigns-grid ${viewMode === 'list' ? 'campaigns-list-view' : ''}`}>
      {localCampaigns.map(campaign => {
        const allImages = campaign.images?.length ? campaign.images : (campaign.imageUrl ? [campaign.imageUrl] : [])
        const resolveImg = (url) => url?.startsWith('/uploads') ? `http://localhost:5001${url}` : url
        const handleImgError = (e) => { e.target.style.display = 'none'; e.target.parentElement.classList.add('card-img-broken') }
        const cardImages = allImages.slice(0, 3)
        const extraImgs = allImages.length - 3
        return (
        <div key={campaign.id} className="campaign-card">
          <div className={`campaign-card-visual card-imgs-${Math.min(allImages.length, 3)}`} onClick={() => setDetailCampaign(campaign)}>
            {cardImages.length > 0
              ? <>
                  {cardImages.map((img, i) => (
                    <div key={i} className={`card-img-cell ${i === 0 ? 'card-img-main' : 'card-img-side'}`}>
                      <img src={resolveImg(img)} alt="" onError={handleImgError} />
                      {i === 2 && extraImgs > 0 && (
                        <div className="card-img-plus">+{extraImgs}</div>
                      )}
                    </div>
                  ))}
                </>
              : <div className="campaign-thumb-placeholder">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
                  </svg>
                </div>
            }
            <span className={`campaign-badge ${STATUS_CLASSES[campaign.status] || 'badge-onetime'}`}>
              {STATUS_LABELS[campaign.status] || campaign.status}
            </span>
          </div>

          <div className="campaign-card-body">
            <div className="campaign-card-header">
              <h4 className="campaign-card-title" onClick={() => setDetailCampaign(campaign)}>                {campaign.title || campaign.content?.slice(0, 40) || 'קמפיין'}
              </h4>
              <div className="actions-menu-wrap" ref={menuId === campaign.id ? menuRef : undefined}>
                <button className="actions-dots-btn" onClick={(e) => { e.stopPropagation(); setMenuId(menuId === campaign.id ? null : campaign.id) }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>
                </button>
                {menuId === campaign.id && (
                  <div className="actions-dropdown">
                    {campaign.status !== 'draft' && (
                      <button onClick={() => handleEdit(campaign)}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        ערוך
                      </button>
                    )}
                    {campaign.status !== 'draft' && (campaign.isPaused || campaign.status === 'one-time' ? (
                      <button onClick={() => handleRestart(campaign)}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                        הפעל מחדש
                      </button>
                    ) : (
                      <button onClick={() => handlePause(campaign)}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                        השהה
                      </button>
                    ))}
                    <button onClick={() => handleDuplicate(campaign)}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                      שכפל
                    </button>
                    {campaign.status === 'draft' && (
                      <button onClick={() => navigate('/create-post', { state: { republish: campaign } })}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                        המשך מאיפה שעצרתי
                      </button>
                    )}
                    <button className="actions-danger" onClick={() => handleDelete(campaign)}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                      מחק
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="campaign-card-meta">
              <span
                className="campaign-groups-count"
                onClick={(e) => { e.stopPropagation(); setTooltipId(tooltipId === campaign.id ? null : campaign.id) }}
                onMouseEnter={() => setTooltipId(campaign.id)}
                onMouseLeave={() => setTooltipId(null)}
              >
                👥 {campaign.groupCount === 1 ? `פורסם ב: ${campaign.groupNames?.[0] || ''}` : `${campaign.groupCount} קבוצות`}
                {tooltipId === campaign.id && campaign.groupNames?.length > 1 && (
                  <div className="campaign-tooltip">
                    {campaign.groupNames.map((name, i) => (
                      <div key={i} className="tooltip-group-name">{name}</div>
                    ))}
                  </div>
                )}
              </span>

              <span className="campaign-date">
                {new Date(campaign.createdAt).toLocaleDateString('he-IL', {
                  day: 'numeric', month: 'short', year: 'numeric'
                })}
              </span>
            </div>

            {campaign.campaignType === 'RECURRING' && campaign.recurringDays?.length > 0 && (
              <div className="campaign-recurring-info">
                <span className="recurring-icon">🔄</span>
                <span className="recurring-days">
                  {campaign.recurringDays.map(d => DAY_NAMES[d]).join(', ')}
                </span>
                {campaign.recurringTime && (
                  <span className="recurring-time">{campaign.recurringTime}</span>
                )}
              </div>
            )}
          </div>
        </div>
      )})}
    </div>

    {editCampaign && (
      <EditCampaignModal
        campaign={editCampaign}
        groups={groups}
        loading={loading}
        onSave={handleEditSave}
        onClose={() => setEditCampaign(null)}
      />
    )}

    {detailCampaign && (
      <CampaignDetailModal
        campaign={detailCampaign}
        onClose={() => setDetailCampaign(null)}
        groups={groups}
        loading={loading}
        onSave={(data, imgs) => { handleEditSave(detailCampaign.id, data, imgs); setDetailCampaign(null) }}
        onPause={() => { setDetailCampaign(null); handlePause(detailCampaign) }}
        onDuplicate={() => { setDetailCampaign(null); handleDuplicate(detailCampaign) }}
        onDelete={() => { setDetailCampaign(null); handleDelete(detailCampaign) }}
      />
    )}
    <ConfirmDialog
      open={!!confirmAction}
      title={confirmAction?.title}
      message={confirmAction?.message}
      onConfirm={() => { confirmAction?.action(); setConfirmAction(null) }}
      onCancel={() => setConfirmAction(null)}
    />
    </>
  )
}

function GroupsPanel({ groups, navigate, sessionRequired, viewMode }) {
  const [detailGroup, setDetailGroup] = useState(null)
  const [visibleCount, setVisibleCount] = useState(15)

  const visibleGroups = groups.slice(0, visibleCount)
  const hasMore = groups.length > visibleCount

  if (sessionRequired) return (
    <div className="empty-state">
      <div className="empty-icon-wrap">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>
        </svg>
      </div>
      <h3>נדרש חיבור לפייסבוק</h3>
      <p>חבר את חשבון הפייסבוק שלך מהבאנר למעלה כדי לסנכרן קבוצות</p>
    </div>
  )

  if (!groups.length) return (
    <div className="empty-state">
      <div className="empty-icon-wrap">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>
        </svg>
      </div>
      <h3>אין קבוצות שמורות</h3>
      <p>סנכרן את הקבוצות שלך מפייסבוק באמצעות כפתור "רענן קבוצות" למעלה</p>
    </div>
  )

  return (
    <div>

      {viewMode === 'list' ? (
        /* ═══ Row/List View ═══ */
        <div className="groups-list">
          <div className="groups-list-header">
            <span className="gl-col gl-col-name">קבוצה</span>
            <span className="gl-col gl-col-members">חברים</span>
            <span className="gl-col gl-col-posts">משרדות מתוזמנות</span>
            <span className="gl-col gl-col-scheduled">פוסטים מתוזמנים</span>
            <span className="gl-col gl-col-action"></span>
          </div>
          {visibleGroups.map(group => (
            <div key={group.id} className="groups-list-row" onClick={() => setDetailGroup(group)}>
              <div className="gl-col gl-col-name">
                <div className="gl-thumb">
                  {group.image
                    ? <img src={group.image} alt="" onError={e => { e.target.style.display = 'none'; e.target.nextSibling && (e.target.nextSibling.style.display = 'flex') }} />
                    : null}
                  <div className="gl-thumb-fallback" style={group.image ? { display: 'none' } : undefined}>👥</div>
                </div>
                <div className="gl-name-wrap">
                  <h4>{group.name}</h4>
                  <span className="gl-privacy">{group.privacyType === 'private' ? 'קבוצה פרטית' : 'קבוצה ציבורית'}</span>
                </div>
              </div>
              <div className="gl-col gl-col-members">
                <span className="gl-stat-value">{group.memberCount ? (group.memberCount >= 1000 ? (group.memberCount / 1000).toFixed(1) + 'K' : group.memberCount.toLocaleString()) : '—'}</span>
              </div>
              <div className="gl-col gl-col-posts">
                <span className="gl-stat-value">{group.postsCount || 0}</span>
              </div>
              <div className="gl-col gl-col-scheduled">
                <span className="gl-stat-value">{group.scheduledCount || 0}</span>
              </div>
              <div className="gl-col gl-col-action">
                <button className="gl-open-btn" onClick={(e) => { e.stopPropagation(); setDetailGroup(group) }}>
                  פתח
                </button>
                <svg className="gl-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="15 18 9 12 15 6"/>
                </svg>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* ═══ Grid/Cube View ═══ */
        <div className="groups-grid-view">
          {visibleGroups.map(group => (
            <div key={group.id} className="group-grid-card" onClick={() => setDetailGroup(group)}>
              <div className="group-grid-thumb">
                {group.image
                  ? <img src={group.image} alt="" onError={e => { e.target.style.display = 'none'; e.target.nextSibling && (e.target.nextSibling.style.display = 'flex') }} />
                  : null}
                <div className="group-grid-fallback" style={group.image ? { display: 'none' } : undefined}>👥</div>
              </div>
              <div className="group-grid-body">
                <h4>{group.name}</h4>
                <span className="group-grid-privacy">{group.privacyType === 'private' ? '🔒 פרטית' : '🌐 ציבורית'}</span>
                <div className="group-grid-stats">
                  <div className="group-grid-stat">
                    <span className="group-grid-stat-val">{group.memberCount ? (group.memberCount >= 1000 ? (group.memberCount / 1000).toFixed(1) + 'K' : group.memberCount) : '—'}</span>
                    <span className="group-grid-stat-label">חברים</span>
                  </div>
                  <div className="group-grid-stat">
                    <span className="group-grid-stat-val">{group.postsCount || 0}</span>
                    <span className="group-grid-stat-label">פוסטים</span>
                  </div>
                  <div className="group-grid-stat">
                    <span className="group-grid-stat-val">{group.scheduledCount || 0}</span>
                    <span className="group-grid-stat-label">מתוזמנים</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Load more button */}
      {hasMore && (
        <div className="groups-load-more">
          <button className="groups-load-more-btn" onClick={() => setVisibleCount(prev => prev + 15)}>
            טען עוד ↓
          </button>
        </div>
      )}

      {/* ═══ Group Detail Modal ═══ */}
      {detailGroup && (
        <div className="modal-overlay" onClick={() => setDetailGroup(null)}>
          <div className="modal-content group-detail-modal" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setDetailGroup(null)}>✕</button>
            {/* Hero */}
            <div className="gd-hero">
              {detailGroup.image && <img src={detailGroup.image} alt="" className="gd-hero-img" onError={e => e.target.style.display = 'none'} />}
              <div className="gd-hero-overlay">
                <div className="gd-hero-thumb">
                  {detailGroup.image
                    ? <img src={detailGroup.image} alt="" onError={e => e.target.style.display = 'none'} />
                    : <span>👥</span>}
                </div>
                <h3 className="gd-hero-title">{detailGroup.name}</h3>
                <span className="gd-hero-privacy">{detailGroup.privacyType === 'private' ? '🔒 קבוצה פרטית' : '🌐 קבוצה ציבורית'}</span>
              </div>
            </div>
            {/* Stats */}
            <div className="gd-stats">
              <div className="gd-stat">
                <span className="gd-stat-val">{detailGroup.memberCount ? detailGroup.memberCount.toLocaleString() : '—'}</span>
                <span className="gd-stat-label">חברים</span>
              </div>
              <div className="gd-stat">
                <span className="gd-stat-val">{detailGroup.postsCount || 0}</span>
                <span className="gd-stat-label">פוסטים</span>
              </div>
              <div className="gd-stat">
                <span className="gd-stat-val">{detailGroup.scheduledCount || 0}</span>
                <span className="gd-stat-label">מתוזמנים</span>
              </div>
            </div>
            {/* Actions */}
            <div className="gd-actions">
              <button className="gd-action-btn gd-action-publish" onClick={() => { setDetailGroup(null); navigate('/create-post', { state: { group: detailGroup } }) }}>
                🚀 פרסם בקבוצה
              </button>
              <a href={detailGroup.url} target="_blank" rel="noopener noreferrer" className="gd-action-btn gd-action-link">
                🔗 פתח בפייסבוק
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function PostsPanel({ posts, navigate, groups, onUpdate, viewMode }) {
  const [menuId, setMenuId] = useState(null)
  const [reschedulePost, setReschedulePost] = useState(null)
  const [detailPost, setDetailPost] = useState(null)
  const [loading, setLoading] = useState(false)
  const [localPosts, setLocalPosts] = useState(posts)
  const [confirmAction, setConfirmAction] = useState(null)
  const menuRef = useRef(null)

  useEffect(() => { setLocalPosts(posts) }, [posts])

  useEffect(() => {
    if (!menuId) return
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuId(null)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuId])

  const handleDelete = async (item) => {
    setMenuId(null)
    setConfirmAction({
      title: 'מחיקת רשומת פרסום',
      message: 'האם אתה בטוח שברצונך למחוק את רשומת הפרסום?',
      action: async () => {
        setLocalPosts(prev => prev.filter(p => p.id !== item.id))
        try {
          await groupsService.deleteHistory(item.id)
          onUpdate()
        } catch {
          setLocalPosts(prev => [...prev, item])
        }
      }
    })
  }

  const handleRestart = (item) => {
    setMenuId(null)
    setReschedulePost(item)
  }

  const handleReschedule = async (data) => {
    setLoading(true)
    try {
      await groupsService.schedulePost({
        postId: reschedulePost.post?.id || reschedulePost.id,
        ...data,
      })
      setReschedulePost(null)
      onUpdate()
    } catch { /* ignore */ }
    setLoading(false)
  }
  if (!localPosts.length) return (
    <div className="empty-state">
      <div className="empty-icon-wrap">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
        </svg>
      </div>
      <h3>עדיין לא פרסמת</h3>
      <p>הפוסטים שלך יופיעו כאן אחרי הפרסום הראשון</p>
      <Link to="/create-post" className="empty-btn">+ צור פוסט</Link>
    </div>
  )

  const resolveImg = (url) => url?.startsWith('/uploads') ? `http://localhost:5001${url}` : url
  const handleImgError2 = (e) => { e.target.style.display = 'none'; e.target.parentElement.classList.add('card-img-broken') }

  return (
    <>
    <div className={`campaigns-grid ${viewMode === 'list' ? 'campaigns-list-view' : ''}`}>
      {localPosts.map(item => {
        const allImages = item.post?.images || item.images || []
        const cardImages = allImages.slice(0, 3)
        const extraImgs = allImages.length - 3
        return (
        <div key={item.id} className="campaign-card">
          <div className={`campaign-card-visual card-imgs-${Math.min(allImages.length, 3)}`} onClick={() => setDetailPost(item)}>
            {cardImages.length > 0
              ? <>
                  {cardImages.map((img, i) => (
                    <div key={i} className={`card-img-cell ${i === 0 ? 'card-img-main' : 'card-img-side'}`}>
                      <img src={resolveImg(img)} alt="" onError={handleImgError2} />
                      {i === 2 && extraImgs > 0 && (
                        <div className="card-img-plus">+{extraImgs}</div>
                      )}
                    </div>
                  ))}
                </>
              : <div className="campaign-thumb-placeholder">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
                  </svg>
                </div>
            }
            <span className="campaign-badge badge-success">✓ פורסם</span>
          </div>

          <div className="campaign-card-body">
            <div className="campaign-card-header">
              <h4 className="campaign-card-title" onClick={() => setDetailPost(item)}>
                {item.post?.title || item.post?.content?.slice(0, 40) || ''}
              </h4>
              <div className="actions-menu-wrap" ref={menuId === item.id ? menuRef : undefined}>
                <button className="actions-dots-btn" onClick={(e) => { e.stopPropagation(); setMenuId(menuId === item.id ? null : item.id) }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>
                </button>
                {menuId === item.id && (
                  <div className="actions-dropdown">
                    <button onClick={() => handleRestart(item)}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                      הפעל מחדש
                    </button>
                    <button className="actions-danger" onClick={() => handleDelete(item)}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                      מחק
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="campaign-card-meta">
              <span className="campaign-groups-count">👥 {item.group?.name || ''}</span>
              <span className="campaign-date">
                {item.publishedAt ? new Date(item.publishedAt).toLocaleDateString('he-IL', {
                  day: 'numeric', month: 'short', year: 'numeric'
                }) : ''}
              </span>
            </div>
          </div>
        </div>
        )
      })}
    </div>

    {reschedulePost && (
      <RescheduleModal
        post={reschedulePost}
        groups={groups}
        loading={loading}
        onSchedule={handleReschedule}
        onClose={() => setReschedulePost(null)}
      />
    )}

    {detailPost && (
      <PostDetailModal
        item={detailPost}
        onClose={() => setDetailPost(null)}
        onRestart={() => { setDetailPost(null); handleRestart(detailPost) }}
        onDelete={() => { setDetailPost(null); handleDelete(detailPost) }}
      />
    )}
    </>
  )
}

function StatsPanel({ stats, dateFrom, dateTo, setDateFrom, setDateTo, onFilter }) {
  const [exposure, setExposure] = useState(null)
  const [period, setPeriod] = useState('month') // day, week, month, custom
  const [loading, setLoading] = useState(true)

  const loadExposure = useCallback(async (from, to) => {
    setLoading(true)
    try {
      const params = {}
      if (from) params.from = from
      if (to) params.to = to
      const res = await groupsService.getExposure(params)
      if (res.data?.exposure) setExposure(res.data.exposure)
    } catch { /* ignore */ }
    setLoading(false)
  }, [])

  useEffect(() => {
    const now = new Date()
    let from
    if (period === 'day') {
      from = new Date(now); from.setHours(0, 0, 0, 0)
    } else if (period === 'week') {
      from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    } else if (period === 'month') {
      from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    } else if (period === 'custom' && dateFrom) {
      from = new Date(dateFrom)
    }
    const to = (period === 'custom' && dateTo) ? dateTo : now.toISOString()
    loadExposure(from?.toISOString?.() || from, to)
  }, [period, dateFrom, dateTo, loadExposure])

  const formatNumber = (n) => {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M'
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K'
    return n?.toLocaleString?.() || '0'
  }

  const chartData = useMemo(() => {
    if (!exposure?.data) return []
    return exposure.data.map(d => ({
      date: new Date(d.date).toLocaleDateString('he-IL', { day: 'numeric', month: 'short' }),
      exposure: d.exposure,
      posts: d.posts,
    }))
  }, [exposure])

  return (
    <div className="stats-layout">
      {/* Period filter */}
      <div className="stats-period-bar">
        {[
          { id: 'day', label: 'היום' },
          { id: 'week', label: 'שבוע' },
          { id: 'month', label: 'חודש' },
          { id: 'custom', label: 'מותאם' },
        ].map(p => (
          <button key={p.id} className={`period-btn ${period === p.id ? 'active' : ''}`} onClick={() => setPeriod(p.id)}>
            {p.label}
          </button>
        ))}
      </div>

      {period === 'custom' && (
        <div className="stats-filter-bar">
          <div className="filter-item">
            <label>מתאריך</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
          </div>
          <div className="filter-item">
            <label>עד תאריך</label>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
          </div>
        </div>
      )}

      {/* KPI Cards */}
      <div className="stats-kpis">
        <div className="stat-box">
          <span className="stat-box-val">{formatNumber(exposure?.currentTotal || 0)}</span>
          <span className="stat-box-label">חשיפה בתקופה</span>
          {exposure?.changePercent !== undefined && (
            <span className={`stat-box-trend ${exposure.changePercent >= 0 ? 'trend-up' : 'trend-down'}`}>
              {exposure.changePercent >= 0 ? '↑' : '↓'} {Math.abs(exposure.changePercent)}%
            </span>
          )}
        </div>
        <div className="stat-box">
          <span className="stat-box-val">{exposure?.currentPosts || 0}</span>
          <span className="stat-box-label">פוסטים בתקופה</span>
        </div>
        <div className="stat-box">
          <span className="stat-box-val">{formatNumber(exposure?.totalPotentialReach || 0)}</span>
          <span className="stat-box-label">חשיפה מקסימלית</span>
        </div>
        <div className="stat-box">
          <span className="stat-box-val">{stats?.groupsCount || 0}</span>
          <span className="stat-box-label">קבוצות פעילות</span>
        </div>
      </div>

      {/* Exposure Chart */}
      {chartData.length > 0 && (
        <div className="stats-chart-card">
          <h4>חשיפה לאורך זמן</h4>
          <div className="stats-chart-container">
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="exposureGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#818cf8" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#818cf8" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" tick={{ fill: '#6b7684', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#6b7684', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={formatNumber} />
                <Tooltip
                  contentStyle={{ background: '#1e2028', border: '1px solid #2a2f3a', borderRadius: 8, color: '#e2e8f0' }}
                  formatter={(val) => [formatNumber(val), 'חשיפה']}
                />
                <Area type="monotone" dataKey="exposure" stroke="#818cf8" strokeWidth={2} fill="url(#exposureGradient)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Top Groups Table */}
      {exposure?.topGroups?.length > 0 && (
        <div className="stats-chart-card">
          <h4>🏆 קבוצות מובילות בחשיפה</h4>
          <div className="top-groups-table">
            {exposure.topGroups.map((g, i) => (
              <div key={g.id} className={`top-group-row ${i === 0 ? 'top-group-gold' : i === 1 ? 'top-group-silver' : ''}`}>
                <span className="top-group-rank">{i + 1}</span>
                <div className="top-group-info">
                  <span className="top-group-name">{g.name}</span>
                  {g.privacyType && <span className="top-group-privacy">{g.privacyType === 'private' ? '🔒' : '🌐'}</span>}
                </div>
                <span className="top-group-members">{formatNumber(g.memberCount)} חברים</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Old stats: publications by group */}
      {stats?.groupStats?.length > 0 && (
        <div className="stats-chart-card">
          <h4>פרסומים לפי קבוצה</h4>
          <div className="bar-chart">
            {stats.groupStats.slice(0, 8).map(g => {
              const maxCount = Math.max(...stats.groupStats.map(x => x.count))
              return (
                <div key={g.id} className="bar-row">
                  <span className="bar-label" title={g.name}>
                    {g.name.length > 20 ? g.name.slice(0, 20) + '…' : g.name}
                  </span>
                  <div className="bar-track">
                    <div className="bar-fill" style={{ width: `${(g.count / maxCount) * 100}%` }} />
                  </div>
                  <span className="bar-value">{g.count}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {loading && !exposure && (
        <div className="empty-state"><p>טוען נתונים...</p></div>
      )}
    </div>
  )
}

function SettingsPanel({ user, logout, setUser, navigate, handleBootstrap, bootstrapping }) {
  const { theme, setTheme } = useTheme()
  const [confirmAction, setConfirmAction] = useState(null)
  // Profile
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState(user?.name || '')
  const [editEmail, setEditEmail] = useState(user?.email || '')
  const [saving, setSaving] = useState(false)
  const [editError, setEditError] = useState(null)
  // Password
  const [showPassword, setShowPassword] = useState(false)
  const [pwStep, setPwStep] = useState(1) // 1=current password, 2=code+new password
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [pwCode, setPwCode] = useState('')
  const [pwSaving, setPwSaving] = useState(false)
  const [pwError, setPwError] = useState(null)
  const [pwSuccess, setPwSuccess] = useState(false)
  // Facebook
  const [disconnecting, setDisconnecting] = useState(false)
  // WhatsApp
  const [waNumber, setWaNumber] = useState(user?.whatsappNumber || '')
  const [waMessage, setWaMessage] = useState(user?.whatsappMessage || '')
  const [waSaving, setWaSaving] = useState(false)
  const [waError, setWaError] = useState(null)
  const [waEditing, setWaEditing] = useState(false)
  const [waValidation, setWaValidation] = useState(null)

  // WhatsApp number validation
  const validateWaNumber = (num) => {
    const cleaned = num.replace(/[^0-9]/g, '')
    if (!cleaned) { setWaValidation(null); return }
    // Israeli mobile: 05x with 10 digits total
    if (/^0[5][0-9]/.test(cleaned)) {
      if (cleaned.length !== 10) {
        setWaValidation({ type: 'error', msg: `מספר ישראלי צריך להיות 10 ספרות (הזנת ${cleaned.length})` })
      } else {
        setWaValidation({ type: 'ok', msg: `יומר אוטומטית ל-972${cleaned.slice(1)}` })
      }
      return
    }
    // International with 972
    if (/^972/.test(cleaned)) {
      if (cleaned.length < 12 || cleaned.length > 13) {
        setWaValidation({ type: 'error', msg: `מספר עם קידומת 972 צריך להיות 12-13 ספרות (הזנת ${cleaned.length})` })
      } else {
        setWaValidation({ type: 'ok', msg: '✓ מספר תקין' })
      }
      return
    }
    // Generic international
    if (cleaned.length < 9 || cleaned.length > 15) {
      setWaValidation({ type: 'error', msg: `מספר לא תקין, צריך להיות בין 9 ל-15 ספרות` })
    } else {
      setWaValidation({ type: 'ok', msg: '✓ מספר תקין' })
    }
  }

  const handleWaNumberChange = (e) => {
    setWaNumber(e.target.value)
    validateWaNumber(e.target.value)
  }

  const handleSaveWhatsapp = async () => {
    setWaSaving(true)
    setWaError(null)
    try {
      const res = await authAPI.updateWhatsapp({ whatsappNumber: waNumber.trim(), whatsappMessage: waMessage.trim() || null })
      if (res.data.success) {
        setUser(prev => ({ ...prev, whatsappNumber: res.data.whatsappNumber, whatsappMessage: res.data.whatsappMessage || null }))
        setWaEditing(false)
        setWaValidation(null)
      }
    } catch (err) {
      setWaError(err.response?.data?.error || 'שגיאה בשמירה')
    } finally {
      setWaSaving(false)
    }
  }

  const handleSaveWaMessage = async () => {
    setWaSaving(true)
    setWaError(null)
    try {
      const res = await authAPI.updateWhatsapp({ whatsappMessage: waMessage.trim() || null })
      if (res.data.success) {
        setUser(prev => ({ ...prev, whatsappMessage: res.data.whatsappMessage || null }))
      }
    } catch (err) {
      setWaError(err.response?.data?.error || 'שגיאה בשמירה')
    } finally {
      setWaSaving(false)
    }
  }

  const handleRemoveWhatsapp = async () => {
    setConfirmAction({
      title: 'הסרת וואטסאפ',
      message: 'האם אתה בטוח שברצונך להסיר את קישור הוואטסאפ?',
      action: async () => {
        setWaSaving(true)
        try {
          await authAPI.updateWhatsapp({ whatsappNumber: null })
          setUser(prev => ({ ...prev, whatsappNumber: null, whatsappMessage: null }))
          setWaNumber('')
          setWaMessage('')
          setWaEditing(false)
          setWaValidation(null)
        } catch { /* ignore */ }
        finally { setWaSaving(false) }
      }
    })
  }

  const handleSaveProfile = async () => {
    setSaving(true)
    setEditError(null)
    try {
      const res = await authAPI.updateProfile({ name: editName, email: editEmail })
      if (res.data.success) {
        setUser(prev => ({ ...prev, name: res.data.user.name, email: res.data.user.email }))
        setEditing(false)
      }
    } catch (err) {
      setEditError(err.response?.data?.error || 'שגיאה בעדכון')
    } finally {
      setSaving(false)
    }
  }

  const handleChangePassword = async () => {
    setPwError(null)
    setPwSuccess(false)

    if (pwStep === 1) {
      // Step 1: verify current password & request code
      if (!currentPassword) {
        setPwError('יש להזין סיסמה נוכחית')
        return
      }
      setPwSaving(true)
      try {
        const res = await authAPI.requestPasswordCode({ currentPassword })
        if (res.data.success) {
          setPwStep(2)
        }
      } catch (err) {
        setPwError(err.response?.data?.error || 'שגיאה')
      } finally {
        setPwSaving(false)
      }
      return
    }

    // Step 2: verify code & set new password
    if (!pwCode.trim()) {
      setPwError('יש להזין את הקוד שנשלח למייל')
      return
    }
    if (newPassword.length < 6) {
      setPwError('סיסמה חדשה חייבת להכיל לפחות 6 תווים')
      return
    }
    if (newPassword !== confirmPassword) {
      setPwError('הסיסמאות לא תואמות')
      return
    }
    setPwSaving(true)
    try {
      const res = await authAPI.changePassword({ code: pwCode, newPassword })
      if (res.data.success) {
        setPwSuccess(true)
        setCurrentPassword('')
        setNewPassword('')
        setConfirmPassword('')
        setPwCode('')
        setPwStep(1)
        setTimeout(() => { setPwSuccess(false); setShowPassword(false) }, 2000)
      }
    } catch (err) {
      setPwError(err.response?.data?.error || 'שגיאה בשינוי סיסמה')
    } finally {
      setPwSaving(false)
    }
  }

  const handleDisconnectFB = async () => {
    setConfirmAction({
      title: 'ניתוק פייסבוק',
      message: 'האם אתה בטוח שברצונך לנתק את חיבור הפייסבוק? לא תוכל לפרסם בקבוצות עד שתתחבר מחדש.',
      action: async () => {
        setDisconnecting(true)
        try {
          await authAPI.disconnectFacebook()
          setUser(prev => ({ ...prev, fbSessionValid: false }))
        } catch { /* ignore */ }
        finally { setDisconnecting(false) }
      }
    })
  }

  const handleLogout = async () => {
    setConfirmAction({
      title: 'התנתקות',
      message: 'האם אתה בטוח שברצונך להתנתק מהמערכת?',
      action: async () => {
        await logout()
        navigate('/login')
      }
    })
  }

  return (
    <div className="settings-page">
      {/* ═══ Profile Hero (Centered Avatar + Name) ═══ */}
      <div className="settings-hero">
        <div className="settings-avatar-wrap">
          <div className="settings-avatar">
            {user?.profileImage || user?.avatarUrl
              ? <img src={user.profileImage || user.avatarUrl} alt="" />
              : <span>{user?.name?.[0] || '?'}</span>}
          </div>
          <label className="settings-avatar-upload" title="העלה תמונה">
            <input type="file" accept="image/*" hidden onChange={async (e) => {
              const file = e.target.files?.[0]
              if (!file) return
              try {
                const res = await authAPI.uploadAvatar(file)
                if (res.data.success) {
                  setUser(prev => ({ ...prev, profileImage: res.data.profileImage }))
                }
              } catch { /* ignore */ }
            }} />
            📷
          </label>
        </div>
        <h2 className="settings-hero-name">{user?.name || 'משתמש'}</h2>
        <p className="settings-hero-email">{user?.email || ''}</p>
      </div>

      {/* ═══ Cards Grid ═══ */}
      <div className="settings-grid">
        {/* ─── Profile Card ─── */}
        <section className="settings-card">
          <div className="settings-card-header">
            <div className="settings-card-icon">👤</div>
            <h3>פרטי משתמש</h3>
            {!editing && (
              <button className="settings-edit-btn" onClick={() => { setEditing(true); setEditName(user?.name || ''); setEditEmail(user?.email || '') }}>
                ✏️ ערוך
              </button>
            )}
          </div>
          <div className="settings-card-body">
            {editing ? (
              <>
                <div className="settings-field">
                  <label>שם</label>
                  <input value={editName} onChange={e => setEditName(e.target.value)} placeholder="השם שלך" />
                </div>
                <div className="settings-field">
                  <label>אימייל</label>
                  <input value={editEmail} onChange={e => setEditEmail(e.target.value)} placeholder="email@example.com" type="email" dir="ltr" />
                </div>
                {editError && <div className="settings-msg settings-msg-error">{editError}</div>}
                <div className="settings-field-actions">
                  <button className="settings-btn-save" onClick={handleSaveProfile} disabled={saving}>
                    {saving ? '⏳ שומר...' : '💾 שמור שינויים'}
                  </button>
                  <button className="settings-btn-cancel" onClick={() => setEditing(false)}>ביטול</button>
                </div>
              </>
            ) : (
              <>
                <div className="settings-info-row">
                  <span className="settings-info-label">שם</span>
                  <span className="settings-info-value">{user?.name || ''}</span>
                </div>
                <div className="settings-info-row">
                  <span className="settings-info-label">אימייל</span>
                  <span className="settings-info-value">{user?.email || ''}</span>
                </div>
              </>
            )}

            {/* Password change */}
            <div className="settings-divider" />
            {!showPassword ? (
              <button className="settings-btn-outline" onClick={() => setShowPassword(true)}>
                🔒 שנה סיסמה
              </button>
            ) : (
              <div className="settings-password-form">
                {pwStep === 1 ? (
                  <div className="settings-field">
                    <label>סיסמה נוכחית</label>
                    <input type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} placeholder="הזן סיסמה נוכחית" dir="ltr" />
                    <span className="settings-field-hint hint-info">לאחר אימות, ישלח קוד למייל שלך</span>
                  </div>
                ) : (
                  <>
                    <div className="settings-msg settings-msg-success" style={{ marginBottom: 12 }}>
                      📧 קוד אימות נשלח ל-{user?.email}
                    </div>
                    <div className="settings-field">
                      <label>קוד אימות</label>
                      <input type="text" value={pwCode} onChange={e => setPwCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="6 ספרות" dir="ltr" maxLength={6} style={{ textAlign: 'center', letterSpacing: '4px', fontSize: '18px' }} />
                    </div>
                    <div className="settings-field">
                      <label>סיסמה חדשה</label>
                      <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="לפחות 6 תווים" dir="ltr" />
                    </div>
                    <div className="settings-field">
                      <label>אימות סיסמה חדשה</label>
                      <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="הזן שוב" dir="ltr" />
                    </div>
                  </>
                )}
                {pwError && <div className="settings-msg settings-msg-error">{pwError}</div>}
                {pwSuccess && <div className="settings-msg settings-msg-success">✓ הסיסמה שונתה בהצלחה!</div>}
                <div className="settings-field-actions">
                  <button className="settings-btn-save" onClick={handleChangePassword} disabled={pwSaving || (pwStep === 1 ? !currentPassword : (!pwCode || !newPassword))}>
                    {pwSaving ? '⏳' : pwStep === 1 ? '📧 שלח קוד אימות' : '🔑 שנה סיסמה'}
                  </button>
                  <button className="settings-btn-cancel" onClick={() => { setShowPassword(false); setPwError(null); setPwStep(1); setCurrentPassword(''); setNewPassword(''); setConfirmPassword(''); setPwCode('') }}>ביטול</button>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* ─── Connections Card ─── */}
        <section className="settings-card">
          <div className="settings-card-header">
            <div className="settings-card-icon">🔗</div>
            <h3>חיבורים</h3>
          </div>
          <div className="settings-card-body">
            {/* Facebook */}
            <div className={`settings-connection-item ${!user?.fbSessionValid ? 'connection-disconnected' : ''}`}>
              <div className="settings-connection-info">
                <span className="settings-connection-icon">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="#1877F2"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                </span>
                <div>
                  <span className="settings-connection-name">פייסבוק</span>
                  <span className={`settings-connection-status ${user?.fbSessionValid ? 'status-ok' : 'status-err'}`}>
                    {user?.fbSessionValid ? '✓ מחובר' : '✗ לא מחובר'}
                  </span>
                </div>
              </div>
              <div className="settings-connection-actions">
                {user?.fbSessionValid ? (
                  <>
                    <button className="settings-btn-outline settings-btn-sm" onClick={handleBootstrap} disabled={bootstrapping}>
                      {bootstrapping ? '⏳' : '🔄'} החלף
                    </button>
                    <button className="settings-btn-danger-sm" onClick={handleDisconnectFB} disabled={disconnecting}>
                      {disconnecting ? '⏳' : '🔌'} נתק
                    </button>
                  </>
                ) : (
                  <button className="settings-btn-primary-sm" onClick={handleBootstrap} disabled={bootstrapping}>
                    {bootstrapping ? '⏳ ממתין...' : '🔗 קשר חיבור'}
                  </button>
                )}
              </div>
            </div>

            {/* WhatsApp */}
            <div className={`settings-connection-item ${!user?.whatsappNumber ? 'connection-disconnected' : ''}`}>
              <div className="settings-connection-info">
                <span className="settings-connection-icon">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="#25D366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                </span>
                <div>
                  <span className="settings-connection-name">וואטסאפ</span>
                  <span className={`settings-connection-status ${user?.whatsappNumber ? 'status-ok' : 'status-err'}`}>
                    {user?.whatsappNumber ? `✓ ${user.whatsappNumber}` : '✗ לא מקושר'}
                  </span>
                </div>
              </div>
              <div className="settings-connection-actions">
                {user?.whatsappNumber && !waEditing ? (
                  <>
                    <button className="settings-btn-outline settings-btn-sm" onClick={() => { setWaEditing(true); setWaNumber(user.whatsappNumber); setWaMessage(user.whatsappMessage || ''); setWaValidation(null) }}>
                      ✏️ ערוך
                    </button>
                    <button className="settings-btn-danger-sm" onClick={handleRemoveWhatsapp} disabled={waSaving}>
                      🗑️ הסר
                    </button>
                  </>
                ) : !user?.whatsappNumber && !waEditing ? (
                  <button className="settings-btn-primary-sm" onClick={() => setWaEditing(true)}>
                    🔗 קשר חיבור
                  </button>
                ) : null}
              </div>
            </div>

            {/* WhatsApp bottom-sheet form */}
            {waEditing && (
              <div className="settings-bottomsheet">
                <div className="settings-bottomsheet-header">
                  <h4>קישור וואטסאפ</h4>
                  <button className="settings-bottomsheet-close" onClick={() => { setWaEditing(false); setWaValidation(null) }}>✕</button>
                </div>
                <div className="settings-bottomsheet-body">
                  <div className="settings-field">
                    <label>מספר טלפון</label>
                    <input
                      value={waNumber}
                      onChange={handleWaNumberChange}
                      placeholder="050-123-4567 או 972501234567"
                      type="tel"
                      dir="ltr"
                    />
                    {waValidation && (
                      <span className={`settings-field-hint ${waValidation.type === 'error' ? 'hint-error' : 'hint-ok'}`}>
                        {waValidation.msg}
                      </span>
                    )}
                  </div>
                  <div className="settings-field">
                    <label>הודעה מותאמת <span className="settings-optional">(אופציונלי)</span></label>
                    <input
                      value={waMessage}
                      onChange={e => setWaMessage(e.target.value)}
                      placeholder="היי, ראיתי את הפוסט שלך..."
                      dir="rtl"
                    />
                    <span className="settings-field-hint hint-info">הודעה שתופיע אוטומטית כשמישהו לוחץ על קישור הוואטסאפ שלך</span>
                  </div>
                  {waError && <div className="settings-msg settings-msg-error">{waError}</div>}
                  <div className="settings-field-actions">
                    <button className="settings-btn-save" onClick={handleSaveWhatsapp} disabled={waSaving || !waNumber.trim()}>
                      {waSaving ? '⏳ שומר...' : '💾 שמור'}
                    </button>
                    <button className="settings-btn-cancel" onClick={() => { setWaEditing(false); setWaValidation(null) }}>ביטול</button>
                  </div>
                </div>
              </div>
            )}

            {/* WhatsApp message edit (when already linked and not editing) */}
            {user?.whatsappNumber && !waEditing && (
              <div className="settings-wa-message-edit">
                <div className="settings-field">
                  <label>הודעה מותאמת</label>
                  <div className="settings-field-row">
                    <input
                      value={waMessage}
                      onChange={e => setWaMessage(e.target.value)}
                      placeholder="היי, ראיתי את הפוסט שלך..."
                      dir="rtl"
                    />
                    <button className="settings-btn-save settings-btn-sm" onClick={handleSaveWaMessage} disabled={waSaving}>
                      💾
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* ─── Appearance Card ─── */}
        <section className="settings-card">
          <div className="settings-card-header">
            <div className="settings-card-icon">🎨</div>
            <h3>מראה</h3>
          </div>
          <div className="settings-card-body">
            <div className="settings-theme-row">
              <span>ערכת נושא</span>
              <div className="theme-toggle">
                <button
                  className={`theme-toggle-btn ${theme === 'dark' ? 'active' : ''}`}
                  onClick={() => setTheme('dark')}
                >
                  🌙 כהה
                </button>
                <button
                  className={`theme-toggle-btn ${theme === 'light' ? 'active' : ''}`}
                  onClick={() => setTheme('light')}
                >
                  ☀️ בהיר
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* ─── Danger Zone Card ─── */}
        <section className="settings-card settings-card-danger">
          <div className="settings-card-body">
            <button className="settings-logout-btn" onClick={handleLogout}>
              🚪 התנתק מהמערכת
            </button>
          </div>
        </section>
      </div>

      <div className="settings-privacy-link">
        <Link to="/privacy">מדיניות פרטיות ותנאי שימוש</Link>
      </div>

      <ConfirmDialog
        open={!!confirmAction}
        title={confirmAction?.title}
        message={confirmAction?.message}
        onConfirm={() => { confirmAction?.action(); setConfirmAction(null) }}
        onCancel={() => setConfirmAction(null)}
      />
    </div>
  )
}

// ─── EDIT CAMPAIGN MODAL ────────────────────────────────

function EditCampaignModal({ campaign, groups, loading, onSave, onClose }) {
  const [text, setText] = useState(campaign.content || '')
  const [title, setTitle] = useState(campaign.title || '')
  const [anonymous, setAnonymous] = useState(campaign.isAnonymous || false)
  const [location, setLocation] = useState(campaign.location || '')
  const [selectedGroups, setSelectedGroups] = useState(campaign.groups?.map(g => g.id) || [])
  const [campaignType, setCampaignType] = useState(campaign.campaignType || 'ONE_TIME')
  const [recurringDays, setRecurringDays] = useState(campaign.recurringDays || [])
  const [recurringTime, setRecurringTime] = useState(campaign.recurringTime || '')
  const [scheduleDate, setScheduleDate] = useState('')
  const [scheduleTime, setScheduleTime] = useState('')
  const [groupSearch, setGroupSearch] = useState('')
  const [newImages, setNewImages] = useState([])
  const [whatsappNumber, setWhatsappNumber] = useState(campaign.whatsappNumber || '')
  const [whatsappMessage, setWhatsappMessage] = useState(campaign.whatsappMessage || '')
  const existingEditImgs = (campaign.images?.length ? campaign.images : (campaign.imageUrl ? [campaign.imageUrl] : []))
    .map(url => url?.startsWith('/uploads') ? `http://localhost:5001${url}` : url)
  const [imagePreviews, setImagePreviews] = useState(existingEditImgs)

  const handleImageSelect = (e) => {
    const files = Array.from(e.target.files)
    const combined = [...newImages, ...files].slice(0, 10)
    setNewImages(combined)
    setImagePreviews(combined.map(f => URL.createObjectURL(f)))
  }
  const removeImage = (idx) => {
    setNewImages(prev => prev.filter((_, i) => i !== idx))
    setImagePreviews(prev => prev.filter((_, i) => i !== idx))
  }

  const filteredGroups = groups.filter(g => g.name.toLowerCase().includes(groupSearch.toLowerCase()))

  const DAY_NAMES = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳']

  const toggleGroup = (id) => {
    setSelectedGroups(prev => prev.includes(id) ? prev.filter(g => g !== id) : [...prev, id])
  }

  const toggleDay = (day) => {
    setRecurringDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day].sort())
  }

  const scheduleMode = campaignType === 'RECURRING' ? 'recurring'
    : (scheduleDate && scheduleTime) ? 'scheduled' : null

  const handleSubmit = (e) => {
    e.preventDefault()
    onSave({
      text,
      title: title || null,
      anonymous,
      location,
      groupIds: selectedGroups,
      campaignType,
      recurringDays,
      recurringTime,
      scheduleMode,
      scheduleDate,
      scheduleTime,
      whatsappNumber: whatsappNumber.trim() || null,
      whatsappMessage: whatsappMessage.trim() || null,
    }, newImages)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content edit-campaign-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>עריכת קמפיין</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit} className="modal-body">
          <div className="form-group">
            <label>כותרת</label>
            <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="כותרת (אופציונלי)" />
          </div>

          <div className="form-group">
            <label>תוכן הפוסט</label>
            <textarea value={text} onChange={e => setText(e.target.value)} rows={4} required />
          </div>

          <div className="form-group">
            <label>תמונות ({imagePreviews.length}/10)</label>
            <div className="edit-images-grid">
              {imagePreviews.map((src, i) => (
                <div key={i} className="edit-image-item">
                  <img src={src} alt="" />
                  <span className="image-number-badge">{i + 1}</span>
                  <button type="button" className="edit-image-remove" onClick={() => removeImage(i)}>✕</button>
                </div>
              ))}
              {imagePreviews.length < 10 && (
                <label className="edit-image-add">
                  <input type="file" accept="image/*" multiple onChange={handleImageSelect} hidden />
                  <span>+</span>
                </label>
              )}
            </div>
          </div>

          <div className="form-group">
            <label>קבוצות</label>
            <input type="text" className="group-search-input" value={groupSearch} onChange={e => setGroupSearch(e.target.value)} placeholder="🔍 חפש קבוצה..." />
            <div className="group-checkboxes">
              {filteredGroups.map(g => (
                <label key={g.id} className={`group-checkbox ${selectedGroups.includes(g.id) ? 'checked' : ''}`}>
                  <input type="checkbox" checked={selectedGroups.includes(g.id)} onChange={() => toggleGroup(g.id)} />
                  <span>{g.name}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="form-row">
            <label className="checkbox-label">
              <input type="checkbox" checked={anonymous} onChange={e => setAnonymous(e.target.checked)} />
              פרסום אנונימי
            </label>
          </div>

          <div className="form-group">
            <label>מיקום</label>
            <input type="text" value={location} onChange={e => setLocation(e.target.value)} placeholder="מיקום (אופציונלי)" />
          </div>

          <div className="form-group">
            <label>סוג קמפיין</label>
            <div className="campaign-type-btns">
              <button type="button" className={campaignType === 'ONE_TIME' ? 'active' : ''} onClick={() => setCampaignType('ONE_TIME')}>חד-פעמי</button>
              <button type="button" className={campaignType === 'SCHEDULED' ? 'active' : ''} onClick={() => setCampaignType('SCHEDULED')}>מתוזמן</button>
              <button type="button" className={campaignType === 'RECURRING' ? 'active' : ''} onClick={() => setCampaignType('RECURRING')}>חוזר</button>
            </div>
          </div>

          {campaignType === 'SCHEDULED' && (
            <div className="form-row">
              <div className="form-group">
                <label>תאריך</label>
                <input type="date" value={scheduleDate} onChange={e => setScheduleDate(e.target.value)} />
              </div>
              <div className="form-group">
                <label>שעה</label>
                <input type="time" value={scheduleTime} onChange={e => setScheduleTime(e.target.value)} />
              </div>
            </div>
          )}

          {campaignType === 'RECURRING' && (
            <>
              <div className="form-group">
                <label>ימים</label>
                <div className="day-picker">
                  {DAY_NAMES.map((name, i) => (
                    <button key={i} type="button" className={`day-btn ${recurringDays.includes(i) ? 'active' : ''}`} onClick={() => toggleDay(i)}>{name}</button>
                  ))}
                </div>
              </div>
              <div className="form-group">
                <label>שעה</label>
                <input type="time" value={recurringTime} onChange={e => setRecurringTime(e.target.value)} />
              </div>
            </>
          )}

          <div className="form-group">
            <label>וואטסאפ (אופציונלי)</label>
            <input type="text" value={whatsappNumber} onChange={e => setWhatsappNumber(e.target.value)} placeholder="מספר וואטסאפ" />
            {whatsappNumber.trim() && (
              <input type="text" value={whatsappMessage} onChange={e => setWhatsappMessage(e.target.value)} placeholder="הודעה מוכנה (אופציונלי)" style={{ marginTop: '8px' }} />
            )}
          </div>

          <button type="submit" className="modal-submit-btn" disabled={loading || !text || !selectedGroups.length}>
            {loading ? '⏳ מעדכן...' : 'עדכן קמפיין'}
          </button>
        </form>
      </div>
    </div>
  )
}

// ─── RESCHEDULE MODAL ───────────────────────────────────

function RescheduleModal({ post, groups, loading, onSchedule, onClose }) {
  const [selectedGroups, setSelectedGroups] = useState(
    post.group ? [post.group.id || post.groupId] : []
  )
  const [scheduleDate, setScheduleDate] = useState('')
  const [scheduleTime, setScheduleTime] = useState('')
  const [groupSearch, setGroupSearch] = useState('')
  const [text, setText] = useState(post.post?.content || '')
  const [isAnonymous, setIsAnonymous] = useState(post.post?.isAnonymous || false)
  const [location, setLocation] = useState(post.post?.location || '')
  const [newImages, setNewImages] = useState([])
  const existingImages = (post.post?.images || post.images || [])
    .map(url => url?.startsWith('/uploads') ? `http://localhost:5001${url}` : url)
  const [imagePreviews, setImagePreviews] = useState(existingImages)

  const handleImageSelect = (e) => {
    const files = Array.from(e.target.files)
    const combined = [...newImages, ...files].slice(0, 10)
    setNewImages(combined)
    setImagePreviews(combined.map(f => URL.createObjectURL(f)))
  }
  const removeImage = (idx) => {
    setNewImages(prev => prev.filter((_, i) => i !== idx))
    setImagePreviews(prev => prev.filter((_, i) => i !== idx))
  }

  const filteredGroups = groups.filter(g => g.name.toLowerCase().includes(groupSearch.toLowerCase()))

  const toggleGroup = (id) => {
    setSelectedGroups(prev => prev.includes(id) ? prev.filter(g => g !== id) : [...prev, id])
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!scheduleDate || !scheduleTime || !selectedGroups.length) return
    onSchedule({
      groupIds: selectedGroups,
      scheduledAt: new Date(`${scheduleDate}T${scheduleTime}:00`).toISOString(),
      text,
      isAnonymous,
      location,
    }, newImages)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content reschedule-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>הפעלה מחדש</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit} className="modal-body reschedule-body">
          {/* Content editing */}
          <div className="form-group">
            <label>תוכן הפוסט</label>
            <textarea
              className="reschedule-textarea"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={4}
              placeholder="מה ברצונך לשתף?"
            />
          </div>

          {/* Image editing */}
          <div className="form-group">
            <label>תמונות</label>
            {imagePreviews.length > 0 && (
              <div className="reschedule-images">
                {imagePreviews.map((src, i) => (
                  <div key={i} className="reschedule-img-item">
                    <img src={src} alt="" />
                    <span className="image-number-badge">{i + 1}</span>
                    <button type="button" onClick={() => removeImage(i)} className="reschedule-img-remove">✕</button>
                  </div>
                ))}
              </div>
            )}
            <label className="reschedule-img-add">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
              הוסף תמונות
              <input type="file" accept="image/*" multiple onChange={handleImageSelect} hidden />
            </label>
          </div>

          {/* Options */}
          <div className="form-row reschedule-options">
            <label className={`reschedule-option ${isAnonymous ? 'active' : ''}`}>
              <input type="checkbox" checked={isAnonymous} onChange={(e) => setIsAnonymous(e.target.checked)} hidden />
              🕶️ אנונימי
            </label>
            <div className="reschedule-location-field">
              <input
                type="text"
                placeholder="📍 מיקום (אופציונלי)"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
            </div>
          </div>

          {/* Groups */}
          <div className="form-group">
            <label>קבוצות לפרסום</label>
            <input type="text" className="group-search-input" value={groupSearch} onChange={e => setGroupSearch(e.target.value)} placeholder="🔍 חפש קבוצה..." />
            <div className="group-checkboxes">
              {filteredGroups.map(g => (
                <label key={g.id} className={`group-checkbox ${selectedGroups.includes(g.id) ? 'checked' : ''}`}>
                  <input type="checkbox" checked={selectedGroups.includes(g.id)} onChange={() => toggleGroup(g.id)} />
                  <span>{g.name}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Schedule */}
          <div className="form-row">
            <div className="form-group">
              <label>תאריך</label>
              <input type="date" value={scheduleDate} onChange={e => setScheduleDate(e.target.value)} required />
            </div>
            <div className="form-group">
              <label>שעה</label>
              <input type="time" value={scheduleTime} onChange={e => setScheduleTime(e.target.value)} required />
            </div>
          </div>

          <button type="submit" className="modal-submit-btn" disabled={loading || !scheduleDate || !scheduleTime || !selectedGroups.length}>
            {loading ? '⏳ מתזמן...' : 'תזמן פרסום'}
          </button>
        </form>
      </div>
    </div>
  )
}

// ─── Campaign Detail Modal ─────────────────────────────────

const API_HOST = 'http://localhost:5001'

function CampaignDetailModal({ campaign, onClose, onEdit, onPause, onDuplicate, onDelete, groups, loading, onSave, initialEditing }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [editing, setEditing] = useState(!!initialEditing)
  const [lightboxIdx, setLightboxIdx] = useState(null)
  const menuRef = useRef(null)

  const images = campaign.images?.length ? campaign.images : (campaign.imageUrl ? [campaign.imageUrl] : [])
  const imgSrc = (url) => url?.startsWith('/uploads') ? `${API_HOST}${url}` : url

  const STATUS_LABELS = {
    scheduled: 'מתוזמן', paused: 'מושהה', draft: 'טיוטה',
    recurring: 'חוזר', active: 'פעיל', 'one-time': 'חד-פעמי',
  }
  const DAY_NAMES = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳']

  // Edit form state
  const [text, setText] = useState(campaign.content || '')
  const [title, setTitle] = useState(campaign.title || '')
  const [anonymous, setAnonymous] = useState(campaign.isAnonymous || false)
  const [locationVal, setLocationVal] = useState(campaign.location || '')
  const [selectedGroups, setSelectedGroups] = useState(campaign.groups?.map(g => g.id) || [])
  const [campaignType, setCampaignType] = useState(campaign.campaignType || 'ONE_TIME')
  const [recurringDays, setRecurringDays] = useState(campaign.recurringDays || [])
  const [recurringTime, setRecurringTime] = useState(campaign.recurringTime || '')
  const [scheduleDate, setScheduleDate] = useState('')
  const [scheduleTime, setScheduleTime] = useState('')
  const [groupSearch, setGroupSearch] = useState('')
  const [newImages, setNewImages] = useState([])
  const existingDetailImgs = (campaign.images?.length ? campaign.images : (campaign.imageUrl ? [campaign.imageUrl] : []))
    .map(url => url?.startsWith('/uploads') ? `http://localhost:5001${url}` : url)
  const [imagePreviews, setImagePreviews] = useState(existingDetailImgs)

  const handleImageSelect = (e) => {
    const files = Array.from(e.target.files)
    const combined = [...newImages, ...files].slice(0, 10)
    setNewImages(combined)
    setImagePreviews(combined.map(f => URL.createObjectURL(f)))
  }
  const removeImage = (idx) => {
    setNewImages(prev => prev.filter((_, i) => i !== idx))
    setImagePreviews(prev => prev.filter((_, i) => i !== idx))
  }
  const filteredGroups = (groups || []).filter(g => g.name.toLowerCase().includes(groupSearch.toLowerCase()))
  const toggleGroup = (id) => setSelectedGroups(prev => prev.includes(id) ? prev.filter(g => g !== id) : [...prev, id])
  const toggleDay = (day) => setRecurringDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day].sort())

  const handleEditSubmit = (e) => {
    e.preventDefault()
    const scheduleMode = campaignType === 'RECURRING' ? 'recurring' : (scheduleDate && scheduleTime) ? 'scheduled' : null
    onSave({
      text, title: title || null, anonymous, location: locationVal,
      groupIds: selectedGroups, campaignType, recurringDays, recurringTime,
      scheduleMode, scheduleDate, scheduleTime,
    }, newImages)
  }

  useEffect(() => {
    if (!menuOpen) return
    const handler = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

  // Visible images for grid: max 3 shown
  const visibleImages = images.slice(0, 3)
  const extraCount = images.length - 3

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content detail-modal" onClick={e => e.stopPropagation()}>
        <div className="detail-modal-header">
          <button className="modal-close" onClick={onClose}>✕</button>
          <div className="actions-menu-wrap" ref={menuRef}>
            <button className="actions-dots-btn" onClick={() => setMenuOpen(!menuOpen)}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>
            </button>
            {menuOpen && (
              <div className="actions-dropdown">
                <button onClick={() => { setMenuOpen(false); setEditing(!editing) }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  {editing ? 'ביטול עריכה' : 'ערוך'}
                </button>
                <button onClick={onPause}>
                  {campaign.isPaused ? (
                    <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5 3 19 12 5 21 5 3"/></svg> הפעל מחדש</>
                  ) : (
                    <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg> השהה</>
                  )}
                </button>
                <button onClick={onDuplicate}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                  שכפל
                </button>
                <button className="actions-danger" onClick={onDelete}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                  מחק
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Image grid: 1 big + 2 small + plus */}
        {!editing && (
          <div className={`detail-image-grid imgs-${Math.min(images.length, 3)}`}>
            {images.length > 0 ? (
              <>
                {visibleImages.map((img, i) => (
                  <div key={i} className={`detail-grid-cell ${i === 0 ? 'detail-grid-main' : 'detail-grid-side'}`} onClick={() => setLightboxIdx(i)}>
                    <img src={imgSrc(img)} alt="" />
                    <span className="image-number-badge">{i + 1}</span>
                    {i === 2 && extraCount > 0 && (
                      <div className="detail-grid-plus">+{extraCount}</div>
                    )}
                  </div>
                ))}
              </>
            ) : (
              <div className="detail-no-image">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
                  <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
                </svg>
              </div>
            )}
          </div>
        )}

        {/* Lightbox */}
        {lightboxIdx !== null && (
          <div className="detail-lightbox" onClick={() => setLightboxIdx(null)}>
            <img src={imgSrc(images[lightboxIdx])} alt="" onClick={e => e.stopPropagation()} />
            {images.length > 1 && (
              <>
                <button className="lightbox-nav lightbox-prev" onClick={e => { e.stopPropagation(); setLightboxIdx(i => (i - 1 + images.length) % images.length) }}>‹</button>
                <button className="lightbox-nav lightbox-next" onClick={e => { e.stopPropagation(); setLightboxIdx(i => (i + 1) % images.length) }}>›</button>
                <span className="lightbox-count">{lightboxIdx + 1} / {images.length}</span>
              </>
            )}
          </div>
        )}

        {/* Edit mode */}
        {editing ? (
          <form onSubmit={handleEditSubmit} className="detail-edit-form">
            <div className="form-group">
              <label>כותרת</label>
              <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="כותרת (אופציונלי)" />
            </div>
            <div className="form-group">
              <label>תוכן הפוסט</label>
              <textarea value={text} onChange={e => setText(e.target.value)} rows={4} required />
            </div>
            <div className="form-group">
              <label>תמונות ({imagePreviews.length}/10)</label>
              <div className="edit-images-grid">
                {imagePreviews.map((src, i) => (
                  <div key={i} className="edit-image-item">
                    <img src={src} alt="" />
                    <span className="image-number-badge">{i + 1}</span>
                    <button type="button" className="edit-image-remove" onClick={() => removeImage(i)}>✕</button>
                  </div>
                ))}
                {imagePreviews.length < 10 && (
                  <label className="edit-image-add">
                    <input type="file" accept="image/*" multiple onChange={handleImageSelect} hidden />
                    <span>+</span>
                  </label>
                )}
              </div>
            </div>
            <div className="form-group">
              <label>קבוצות</label>
              <input type="text" className="group-search-input" value={groupSearch} onChange={e => setGroupSearch(e.target.value)} placeholder="🔍 חפש קבוצה..." />
              <div className="group-checkboxes">
                {filteredGroups.map(g => (
                  <label key={g.id} className={`group-checkbox ${selectedGroups.includes(g.id) ? 'checked' : ''}`}>
                    <input type="checkbox" checked={selectedGroups.includes(g.id)} onChange={() => toggleGroup(g.id)} />
                    <span>{g.name}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="form-row">
              <label className="checkbox-label">
                <input type="checkbox" checked={anonymous} onChange={e => setAnonymous(e.target.checked)} />
                פרסום אנונימי
              </label>
            </div>
            <div className="form-group">
              <label>מיקום</label>
              <input type="text" value={locationVal} onChange={e => setLocationVal(e.target.value)} placeholder="מיקום (אופציונלי)" />
            </div>
            <div className="form-group">
              <label>סוג קמפיין</label>
              <div className="campaign-type-btns">
                <button type="button" className={campaignType === 'ONE_TIME' ? 'active' : ''} onClick={() => setCampaignType('ONE_TIME')}>חד-פעמי</button>
                <button type="button" className={campaignType === 'SCHEDULED' ? 'active' : ''} onClick={() => setCampaignType('SCHEDULED')}>מתוזמן</button>
                <button type="button" className={campaignType === 'RECURRING' ? 'active' : ''} onClick={() => setCampaignType('RECURRING')}>חוזר</button>
              </div>
            </div>
            {campaignType === 'SCHEDULED' && (
              <div className="form-row">
                <div className="form-group"><label>תאריך</label><input type="date" value={scheduleDate} onChange={e => setScheduleDate(e.target.value)} /></div>
                <div className="form-group"><label>שעה</label><input type="time" value={scheduleTime} onChange={e => setScheduleTime(e.target.value)} /></div>
              </div>
            )}
            {campaignType === 'RECURRING' && (
              <>
                <div className="form-group">
                  <label>ימים</label>
                  <div className="day-picker">
                    {DAY_NAMES.map((name, i) => (
                      <button key={i} type="button" className={`day-btn ${recurringDays.includes(i) ? 'active' : ''}`} onClick={() => toggleDay(i)}>{name}</button>
                    ))}
                  </div>
                </div>
                <div className="form-group"><label>שעה</label><input type="time" value={recurringTime} onChange={e => setRecurringTime(e.target.value)} /></div>
              </>
            )}
            <div className="detail-edit-actions">
              <button type="submit" className="modal-submit-btn" disabled={loading || !text || !selectedGroups.length}>
                {loading ? '⏳ מעדכן...' : 'עדכן קמפיין'}
              </button>
              <button type="button" className="modal-cancel-btn" onClick={() => setEditing(false)}>ביטול</button>
            </div>
          </form>
        ) : (
          /* View mode details */
          <div className="detail-body">
            <h3 className="detail-title">{campaign.title || 'קמפיין'}</h3>
            <p className="detail-content">{campaign.content}</p>

            <div className="detail-meta">
              <div className="detail-meta-item">
                <span className="detail-label">סטטוס</span>
                <span className={`detail-badge badge-${campaign.status}`}>{STATUS_LABELS[campaign.status] || campaign.status}</span>
              </div>
              <div className="detail-meta-item">
                <span className="detail-label">סוג</span>
                <span>{campaign.campaignType === 'RECURRING' ? 'חוזר' : campaign.campaignType === 'SCHEDULED' ? 'מתוזמן' : 'חד-פעמי'}</span>
              </div>
              {campaign.recurringDays?.length > 0 && (
                <div className="detail-meta-item">
                  <span className="detail-label">ימים</span>
                  <span>{campaign.recurringDays.map(d => DAY_NAMES[d]).join(', ')}{campaign.recurringTime ? ` • ${campaign.recurringTime}` : ''}</span>
                </div>
              )}
              <div className="detail-meta-item">
                <span className="detail-label">קבוצות</span>
                <span>👥 {campaign.groupCount || campaign.groupNames?.length || 0} {campaign.groupNames?.join(', ') || ''}</span>
              </div>
              {campaign.isAnonymous && (
                <div className="detail-meta-item">
                  <span className="detail-label">אנונימי</span>
                  <span>כן</span>
                </div>
              )}
              {campaign.location && (
                <div className="detail-meta-item">
                  <span className="detail-label">מיקום</span>
                  <span>{campaign.location}</span>
                </div>
              )}
              <div className="detail-meta-item">
                <span className="detail-label">נוצר</span>
                <span>{new Date(campaign.createdAt).toLocaleDateString('he-IL', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Post Detail Modal ─────────────────────────────────────

function PostDetailModal({ item, onClose, onRestart, onDelete }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)

  const images = item.post?.images || item.images || []
  const [imageIdx, setImageIdx] = useState(0)
  const imgSrc = (url) => url?.startsWith('/uploads') ? `${API_HOST}${url}` : url

  useEffect(() => {
    if (!menuOpen) return
    const handler = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content detail-modal" onClick={e => e.stopPropagation()}>
        <div className="detail-modal-header">
          <button className="modal-close" onClick={onClose}>✕</button>
          <div className="actions-menu-wrap" ref={menuRef}>
            <button className="actions-dots-btn" onClick={() => setMenuOpen(!menuOpen)}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>
            </button>
            {menuOpen && (
              <div className="actions-dropdown">
                <button onClick={onRestart}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                  הפעל מחדש
                </button>
                <button className="actions-danger" onClick={onDelete}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                  מחק
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Image / Screenshot */}
        <div className="detail-images">
          {images.length > 0 ? (
            <>
              <img src={imgSrc(images[imageIdx])} alt="" className="detail-main-image" />
              {images.length > 1 && (
                <div className="detail-image-nav">
                  <button onClick={() => setImageIdx(i => (i - 1 + images.length) % images.length)} className="img-nav-btn">‹</button>
                  <span className="img-nav-count">{imageIdx + 1} / {images.length}</span>
                  <button onClick={() => setImageIdx(i => (i + 1) % images.length)} className="img-nav-btn">›</button>
                </div>
              )}
            </>
          ) : item.hasScreenshot && item.screenshotUrl && item.screenshotUrl !== 'stored' ? (
            <img src={`data:image/png;base64,${item.screenshotUrl}`} alt="" className="detail-main-image" />
          ) : (
            <div className="detail-no-image">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
                <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
              </svg>
            </div>
          )}
        </div>

        <div className="detail-body">
          {item.post?.title && <h3 className="detail-title">{item.post.title}</h3>}
          <p className="detail-content">{item.post?.content || ''}</p>
          <div className="detail-meta">
            <div className="detail-meta-item">
              <span className="detail-label">קבוצה</span>
              <span>👥 {item.group?.name || ''}</span>
            </div>
            <div className="detail-meta-item">
              <span className="detail-label">סטטוס</span>
              <span className="detail-badge badge-success">✓ פורסם</span>
            </div>
            {item.publishedAt && (
              <div className="detail-meta-item">
                <span className="detail-label">תאריך פרסום</span>
                <span>{new Date(item.publishedAt).toLocaleDateString('he-IL', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            )}
            {item.postUrl && (
              <div className="detail-meta-item">
                <span className="detail-label">קישור</span>
                <a href={item.postUrl} target="_blank" rel="noopener noreferrer" className="detail-link">צפה בפוסט ←</a>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
