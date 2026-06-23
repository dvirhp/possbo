import { useState, useEffect, useMemo } from 'react'
import { useNavigate, Link, useLocation } from 'react-router-dom'
import { useAppData } from '../context/DataProvider'
import { groupsService } from '../services/groupsService'
import '../styles/dashboard.css'

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
    user, authChecked, logout, ensureFresh, forceRefresh,
    campaigns, groups, jobs, posts, stats,
    setStats, updateGroups, refreshing,
  } = useAppData()

  const [activeTab, setActiveTab] = useState(location.state?.tab || 'campaigns')
  const [search, setSearch] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  // Filters
  const [statusFilter, setStatusFilter] = useState('all')
  const [sortBy, setSortBy] = useState('date')

  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [refreshingGroups, setRefreshingGroups] = useState(false)

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
    await logout()
    navigate('/')
  }

  const handleRefreshGroups = async () => {
    setRefreshingGroups(true)
    try {
      const res = await groupsService.scrapeMyGroups()
      if (res.data.success && res.data.groups) {
        updateGroups(res.data.groups.map(g => ({
          id: g.id,
          name: g.name,
          image: g.image || null,
          url: g.url || `https://www.facebook.com/groups/${g.id}`,
        })))
      }
    } catch {
      // silent
    } finally {
      setRefreshingGroups(false)
    }
  }

  // Reset filters on tab change
  useEffect(() => {
    setSearch('')
    setStatusFilter('all')
    setSortBy('date')
  }, [activeTab])

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
    if (sortBy === 'date') {
      list = [...list].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
    } else if (sortBy === 'name') {
      list = [...list].sort((a, b) => (a.title || a.content || '').localeCompare(b.title || b.content || ''))
    }
    return list
  }, [campaigns, search, statusFilter, sortBy])

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
    if (sortBy === 'date') {
      list = [...list].sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0))
    }
    return list
  }, [posts, search, statusFilter, sortBy])

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
    <div className="dash">
      {/* Mobile overlay */}
      {mobileMenuOpen && <div className="mobile-overlay" onClick={() => setMobileMenuOpen(false)} />}

      {/* ─── SIDEBAR ─── */}
      <aside className={`dash-sidebar ${sidebarOpen ? 'open' : 'collapsed'} ${mobileMenuOpen ? 'mobile-open' : ''}`}>
        <div className="sidebar-top">
          <Link to="/dashboard" className="sidebar-logo" onClick={() => setMobileMenuOpen(false)}>
            <div className="sidebar-logo-mark">P</div>
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
              📅 יומן תזמונים
            </Link>
            <Link to="/create-post" className="topbar-cta">
              <span>+</span> קמפיין חדש
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
          {!authChecked ? (
            <div className="dash-loader">
              <div className="loader-pulse"><div/><div/><div/></div>
            </div>
          ) : (
            <>
              {/* KPIs */}
              {activeTab === 'campaigns' && (
                <section className="kpi-row">
                  <div className="kpi-card kpi-clickable" onClick={() => setActiveTab('campaigns')}>
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
                  <div className="kpi-card kpi-clickable" onClick={() => setActiveTab('posts')}>
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
                  <div className="kpi-card kpi-clickable" onClick={() => setActiveTab('groups')}>
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
              {activeTab !== 'settings' && activeTab !== 'stats' && (
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

                  <div className="filter-bar-controls">
                    {/* Status filter for campaigns */}
                    {activeTab === 'campaigns' && (
                      <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="filter-select">
                        <option value="all">כל הסטטוסים</option>
                        <option value="scheduled">מתוזמן</option>
                        <option value="recurring">חוזר</option>
                        <option value="paused">מושהה</option>
                        <option value="draft">טיוטה</option>
                        <option value="active">פעיל</option>
                        <option value="one-time">חד-פעמי</option>
                      </select>
                    )}

                    {/* Status filter for posts */}
                    {activeTab === 'posts' && (
                      <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="filter-select">
                        <option value="all">כל הסטטוסים</option>
                        <option value="SUCCESS">פורסם</option>
                        <option value="FAILED">נכשל</option>
                        <option value="PENDING">ממתין</option>
                      </select>
                    )}

                    {/* Sort */}
                    <select value={sortBy} onChange={e => setSortBy(e.target.value)} className="filter-select">
                      <option value="date">מיון לפי תאריך</option>
                      <option value="name">מיון לפי שם</option>
                      {activeTab === 'groups' && <option value="members">מיון לפי חברים</option>}
                    </select>
                  </div>
                </div>
              )}

              {/* Panel */}
              <div className="dash-panel">
                {activeTab === 'campaigns' && <CampaignsPanel campaigns={filteredCampaigns} navigate={navigate} />}
                {activeTab === 'groups' && <GroupsPanel groups={filteredGroups} navigate={navigate} onRefresh={handleRefreshGroups} refreshing={refreshingGroups} />}
                {activeTab === 'posts' && <PostsPanel posts={filteredPosts} navigate={navigate} />}
                {activeTab === 'stats' && (
                  <StatsPanel stats={stats} dateFrom={dateFrom} dateTo={dateTo}
                    setDateFrom={setDateFrom} setDateTo={setDateTo} onFilter={loadStats} />
                )}
                {activeTab === 'settings' && <SettingsPanel user={user} />}
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
  )
}

// ─── PANELS ─────────────────────────────────────────────

function CampaignsPanel({ campaigns, navigate }) {
  const [tooltipId, setTooltipId] = useState(null)

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

  if (!campaigns.length) return (
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
    <div className="campaigns-grid">
      {campaigns.map(campaign => (
        <div key={campaign.id} className="campaign-card" onClick={() => navigate(`/post/${campaign.id}`)}>
          <div className="campaign-card-visual">
            {campaign.imageUrl
              ? <>
                  <img src={campaign.imageUrl} alt="" className="campaign-thumb" />
                  {campaign.imageCount > 1 && (
                    <span className="campaign-image-count">+{campaign.imageCount - 1}</span>
                  )}
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
            <h4 className="campaign-card-title">
              {campaign.title || campaign.content?.slice(0, 40) || 'קמפיין'}
            </h4>

            <div className="campaign-card-meta">
              <span className="campaign-date">
                {new Date(campaign.createdAt).toLocaleDateString('he-IL', {
                  day: 'numeric', month: 'short', year: 'numeric'
                })}
              </span>

              <span
                className="campaign-groups-count"
                onMouseEnter={() => setTooltipId(campaign.id)}
                onMouseLeave={() => setTooltipId(null)}
              >
                👥 {campaign.groupCount} קבוצות
                {tooltipId === campaign.id && campaign.groupNames?.length > 0 && (
                  <div className="campaign-tooltip">
                    {campaign.groupNames.map((name, i) => (
                      <div key={i} className="tooltip-group-name">{name}</div>
                    ))}
                  </div>
                )}
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
      ))}
    </div>
  )
}

function GroupsPanel({ groups, navigate, onRefresh, refreshing }) {
  if (!groups.length) return (
    <div className="empty-state">
      <div className="empty-icon-wrap">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>
        </svg>
      </div>
      <h3>אין קבוצות שמורות</h3>
      <p>סנכרן את הקבוצות שלך מפייסבוק כדי להתחיל</p>
      <button onClick={onRefresh} disabled={refreshing} className="empty-btn">
        {refreshing ? '🔄 מסנכרן...' : '🔄 סנכרן קבוצות מפייסבוק'}
      </button>
    </div>
  )

  return (
    <div>
      <div className="groups-toolbar">
        <button onClick={onRefresh} disabled={refreshing} className="refresh-groups-btn">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={refreshing ? 'spin' : ''}>
            <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
          </svg>
          {refreshing ? 'מסנכרן קבוצות...' : 'רענן קבוצות'}
        </button>
      </div>
      <div className="groups-grid">
        {groups.map(group => (
          <div key={group.id} className="group-card" onClick={() => navigate(`/group/${group.id}`, { state: group })}>
            <div className="group-card-thumb">
              {group.image
                ? <img src={group.image} alt="" />
                : <div className="group-card-fallback">👥</div>}
            </div>
            <div className="group-card-info">
              <h4>{group.name}</h4>
              {group.memberCount && <span>{group.memberCount.toLocaleString()} חברים</span>}
            </div>
            <svg className="group-card-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
          </div>
        ))}
      </div>
    </div>
  )
}

function PostsPanel({ posts, navigate }) {
  if (!posts.length) return (
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

  return (
    <div className="data-table">
      <div className="table-head">
        <div className="th col-screenshot">צילום</div>
        <div className="th col-name">תוכן</div>
        <div className="th col-group">קבוצה</div>
        <div className="th col-status">סטטוס</div>
        <div className="th col-date">תאריך</div>
      </div>
      {posts.map(item => (
        <div key={item.id} className="table-row" onClick={() => navigate(`/post/${item.post?.id || item.id}`)}>
          <div className="td col-screenshot">
            {item.hasScreenshot && item.screenshotUrl && item.screenshotUrl !== 'stored'
              ? <img src={`data:image/png;base64,${item.screenshotUrl}`} alt="" className="post-screenshot-thumb" />
              : <div className="post-screenshot-placeholder">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
                  </svg>
                </div>
            }
          </div>
          <div className="td col-name">
            <span className="td-primary">{item.post?.content?.slice(0, 60) || '—'}</span>
          </div>
          <div className="td col-group">
            <span className="group-chip">{item.group?.name || '—'}</span>
          </div>
          <div className="td col-status">
            <span className="badge badge-success">✓ פורסם</span>
          </div>
          <div className="td col-date">
            <span className="td-date">{item.publishedAt ? new Date(item.publishedAt).toLocaleDateString('he-IL') : '—'}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

function StatsPanel({ stats, dateFrom, dateTo, setDateFrom, setDateTo, onFilter }) {
  if (!stats) return (
    <div className="empty-state">
      <div className="empty-icon-wrap">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
        </svg>
      </div>
      <h3>אין נתונים</h3>
    </div>
  )

  const maxCount = stats.groupStats?.length > 0
    ? Math.max(...stats.groupStats.map(g => g.count))
    : 1

  return (
    <div className="stats-layout">
      <div className="stats-filter-bar">
        <div className="filter-item">
          <label>מתאריך</label>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
        </div>
        <div className="filter-item">
          <label>עד תאריך</label>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
        </div>
        <button className="filter-btn" onClick={onFilter}>סנן</button>
      </div>

      <div className="stats-kpis">
        <div className="stat-box">
          <span className="stat-box-val">{stats.publishedCount}</span>
          <span className="stat-box-label">סה״כ פרסומים</span>
        </div>
        <div className="stat-box">
          <span className="stat-box-val">{stats.groupsCount}</span>
          <span className="stat-box-label">קבוצות פעילות</span>
        </div>
        <div className="stat-box">
          <span className="stat-box-val">{stats.scheduledCount}</span>
          <span className="stat-box-label">ממתינים לפרסום</span>
        </div>
      </div>

      {stats.groupStats?.length > 0 && (
        <div className="stats-chart-card">
          <h4>פרסומים לפי קבוצה</h4>
          <div className="bar-chart">
            {stats.groupStats.slice(0, 8).map(g => (
              <div key={g.id} className="bar-row">
                <span className="bar-label" title={g.name}>
                  {g.name.length > 20 ? g.name.slice(0, 20) + '…' : g.name}
                </span>
                <div className="bar-track">
                  <div className="bar-fill" style={{ width: `${(g.count / maxCount) * 100}%` }} />
                </div>
                <span className="bar-value">{g.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function SettingsPanel({ user }) {
  return (
    <div className="settings-card">
      <div className="settings-header">
        <h3>פרטי חשבון</h3>
      </div>
      <div className="settings-body">
        <div className="settings-row">
          <span className="settings-key">שם</span>
          <span className="settings-val">{user?.name || '—'}</span>
        </div>
        <div className="settings-row">
          <span className="settings-key">אימייל</span>
          <span className="settings-val">{user?.email || '—'}</span>
        </div>
        <div className="settings-row">
          <span className="settings-key">פייסבוק</span>
          <span className={`settings-val ${user?.hasFacebookCredentials ? 'val-ok' : 'val-err'}`}>
            {user?.hasFacebookCredentials ? '✓ מחובר' : '✗ לא מחובר'}
          </span>
        </div>
      </div>
    </div>
  )
}
