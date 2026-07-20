import { useState, useEffect, useMemo, useRef, useCallback, Fragment } from 'react'
import { useNavigate, Link, useLocation, useSearchParams } from 'react-router-dom'
import { useAppData } from '../context/DataProvider'
import { useTheme } from '../context/ThemeProvider'
import { groupsService } from '../services/groupsService'
import { authAPI } from '../services/api'
import ConfirmDialog from '../components/ConfirmDialog'
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip } from 'recharts'
import DashboardOverview from '../components/DashboardOverview'

/** Normalize fancy Unicode text (Mathematical Bold/Italic/Script etc.) to plain ASCII */
function normalizeFancyText(str) {
  if (!str) return str
  // Map Unicode Mathematical Alphanumeric Symbols to plain ASCII
  const ranges = [
    [0x1D400, 0x1D419, 65],  // Bold A-Z
    [0x1D41A, 0x1D433, 97],  // Bold a-z
    [0x1D434, 0x1D44D, 65],  // Italic A-Z
    [0x1D44E, 0x1D467, 97],  // Italic a-z
    [0x1D468, 0x1D481, 65],  // Bold Italic A-Z
    [0x1D482, 0x1D49B, 97],  // Bold Italic a-z
    [0x1D49C, 0x1D4B5, 65],  // Script A-Z
    [0x1D4B6, 0x1D4CF, 97],  // Script a-z
    [0x1D4D0, 0x1D4E9, 65],  // Bold Script A-Z
    [0x1D4EA, 0x1D503, 97],  // Bold Script a-z
    [0x1D504, 0x1D51D, 65],  // Fraktur A-Z
    [0x1D51E, 0x1D537, 97],  // Fraktur a-z
    [0x1D538, 0x1D551, 65],  // Double-struck A-Z
    [0x1D552, 0x1D56B, 97],  // Double-struck a-z
    [0x1D56C, 0x1D585, 65],  // Bold Fraktur A-Z
    [0x1D586, 0x1D59F, 97],  // Bold Fraktur a-z
    [0x1D5A0, 0x1D5B9, 65],  // Sans-serif A-Z
    [0x1D5BA, 0x1D5D3, 97],  // Sans-serif a-z
    [0x1D5D4, 0x1D5ED, 65],  // Sans-serif Bold A-Z
    [0x1D5EE, 0x1D607, 97],  // Sans-serif Bold a-z
    [0x1D608, 0x1D621, 65],  // Sans-serif Italic A-Z
    [0x1D622, 0x1D63B, 97],  // Sans-serif Italic a-z
    [0x1D63C, 0x1D655, 65],  // Sans-serif Bold Italic A-Z
    [0x1D656, 0x1D66F, 97],  // Sans-serif Bold Italic a-z
    [0x1D670, 0x1D689, 65],  // Monospace A-Z
    [0x1D68A, 0x1D6A3, 97],  // Monospace a-z
    [0x1D7CE, 0x1D7D7, 48],  // Bold 0-9
    [0x1D7D8, 0x1D7E1, 48],  // Double-struck 0-9
    [0x1D7E2, 0x1D7EB, 48],  // Sans-serif 0-9
    [0x1D7EC, 0x1D7F5, 48],  // Sans-serif Bold 0-9
    [0x1D7F6, 0x1D7FF, 48],  // Monospace 0-9
  ]
  let result = ''
  for (const ch of str) {
    const cp = ch.codePointAt(0)
    let replaced = false
    for (const [start, end, base] of ranges) {
      if (cp >= start && cp <= end) {
        result += String.fromCharCode(base + (cp - start))
        replaced = true
        break
      }
    }
    if (!replaced) result += ch
  }
  return result
}

/** Fill missing dates with zero values so chart shows the full date range */
function fillDateRange(data, from, to) {
  if (!from || !to) return data || []
  const map = new Map()
  for (const d of (data || [])) {
    const key = new Date(d.date).toISOString().split('T')[0]
    map.set(key, d)
  }
  const result = []
  const start = new Date(from)
  const end = new Date(to)
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const key = d.toISOString().split('T')[0]
    if (map.has(key)) {
      result.push(map.get(key))
    } else {
      result.push({ date: key, exposure: 0, posts: 0 })
    }
  }
  return result
}

function useContainerSize() {
  const [el, setEl] = useState(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  useEffect(() => {
    if (!el) return
    const update = () => {
      const { width, height } = el.getBoundingClientRect()
      setSize(prev => (prev.width === Math.round(width) && prev.height === Math.round(height)) ? prev : { width: Math.round(width), height: Math.round(height) })
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [el])
  return [setEl, size]
}
import '../styles/dashboard.css'
import '../styles/overview.css'
import OtpInput from '../components/OtpInput'

const TABS = [
  { id: 'campaigns', icon: '📅', label: 'קמפיינים' },
  { id: 'groups', icon: '👥', label: 'קבוצות פייסבוק' },
  { id: 'posts', icon: '📝', label: 'פרסומים' },
  { id: 'stats', icon: '📊', label: 'סטטיסטיקה' },
  { id: 'account', icon: '👤', label: 'ניהול חשבון' },
]

const NAV_ITEMS = [
  { id: 'campaigns', icon: 'calendar', label: 'קמפיינים' },
  { id: 'groups', icon: 'users', label: 'קבוצות פייסבוק' },
  { id: 'posts', icon: 'send', label: 'פרסומים' },
  { id: 'stats', icon: 'chart', label: 'סטטיסטיקה' },
  { id: 'account', icon: 'account', label: 'ניהול חשבון' },
]

function NavIcon({ type }) {
  const icons = {
    calendar: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
    users: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>,
    send: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>,
    chart: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
    settings: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>,
    account: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  }
  return icons[type] || null
}

export default function Dashboard() {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const {
    user, setUser, authChecked, logout, ensureFresh, forceRefresh,
    campaigns, groups, jobs, posts, stats, dataReady,
    setStats, updateGroups, refreshing,
  } = useAppData()

  const activeTab = searchParams.get('tab') || 'overview'
  const setActiveTab = useCallback((tab) => {
    setSearchParams({ tab }, { replace: true })
  }, [setSearchParams])

  // Respond to global pull-to-refresh from AuthLayout
  useEffect(() => {
    const handler = async () => {
      await forceRefresh()
      window.dispatchEvent(new Event('postit-pull-refresh-done'))
    }
    window.addEventListener('postit-pull-refresh', handler)
    return () => window.removeEventListener('postit-pull-refresh', handler)
  }, [forceRefresh])

  // Sync subTab from URL (e.g. navigating from Overview KPIs)
  useEffect(() => {
    const sub = searchParams.get('subTab')
    if (sub && (sub === 'all' || sub === 'scheduled' || sub === 'published')) {
      setCampaignSubTab(sub)
    }
  }, [searchParams])
  const [search, setSearch] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [viewMode, setViewMode] = useState('list') // 'grid' | 'list'
  const [campaignSubTab, setCampaignSubTab] = useState(() => searchParams.get('subTab') || 'all') // 'all' | 'scheduled' | 'published'

  // Filters
  const [statusFilter, setStatusFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [platformFilter, setPlatformFilter] = useState('all') // 'all' | 'facebook' | 'instagram' | 'both'
  const [groupFilter, setGroupFilter] = useState('all')
  const [groupFilterOpen, setGroupFilterOpen] = useState(false)
  const [groupFilterSearch, setGroupFilterSearch] = useState('')
  const [templateFilter, setTemplateFilter] = useState('all')
  const [templateFilterOpen, setTemplateFilterOpen] = useState(false)
  const [templateFilterSearch, setTemplateFilterSearch] = useState('')
  const [sortBy, setSortBy] = useState('date')

  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [refreshingGroups, setRefreshingGroups] = useState(false)
  const [filterSheetOpen, setFilterSheetOpen] = useState(false)
  const [sheetGroupExpand, setSheetGroupExpand] = useState(false)
  const [sheetTemplateExpand, setSheetTemplateExpand] = useState(false)
  const [sheetGroupSearch, setSheetGroupSearch] = useState('')
  const [sheetTemplateSearch, setSheetTemplateSearch] = useState('')
  const [bootstrapping, setBootstrapping] = useState(false)
  const [dashDateRange, setDashDateRange] = useState({ from: '', to: '' })
  const [showDashDatePicker, setShowDashDatePicker] = useState(false)
  const groupFilterRef = useRef(null)
  const templateFilterRef = useRef(null)
  const dashDateRef = useRef(null)

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

  // Close template filter dropdown on outside click
  useEffect(() => {
    if (!templateFilterOpen) return
    const handler = (e) => {
      if (templateFilterRef.current && !templateFilterRef.current.contains(e.target)) {
        setTemplateFilterOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [templateFilterOpen])

  // Close dash date picker on outside click
  useEffect(() => {
    if (!showDashDatePicker) return
    const handler = (e) => {
      if (dashDateRef.current && !dashDateRef.current.contains(e.target)) {
        setShowDashDatePicker(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showDashDatePicker])

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
      action: () => {
        logout()
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
        // Merge: preserve old memberCount/privacyType if new data is null
        const oldMap = Object.fromEntries(groups.map(g => [g.id, g]))
        updateGroups(res.data.groups.map(g => ({
          id: g.id,
          name: g.name,
          image: g.image || null,
          url: g.url || `https://www.facebook.com/groups/${g.id}`,
          memberCount: g.memberCount || oldMap[g.id]?.memberCount || null,
          privacyType: g.privacyType || oldMap[g.id]?.privacyType || null,
        })))
        window.dispatchEvent(new CustomEvent('postit-sync-done', { detail: { success: true, msg: `✅ סונכרנו ${res.data.groups.length} קבוצות בהצלחה! מעדכן מטא-דאטה ברקע...` } }))
        // Trigger background metadata refresh (returns immediately with 202)
        groupsService.refreshGroupsMetadata().catch(() => {})
        // Poll for completion and refresh groups when done
        const pollMetadata = () => {
          setTimeout(() => {
            groupsService.getRefreshMetadataStatus().then(statusRes => {
              if (statusRes.data?.status === 'in_progress') {
                pollMetadata() // Still running, poll again
              } else {
                // Done — reload groups with updated metadata
                groupsService.getSavedGroups().then(savedRes => {
                  if (savedRes.data?.groups) updateGroups(savedRes.data.groups)
                }).catch(() => {})
              }
            }).catch(() => {})
          }, 15000)
        }
        pollMetadata()
      }
    } catch (err) {
      if (err.response?.status === 428) {
        setSessionRequired(true)
        // Update user state so the FB session banner appears
        setUser(prev => prev ? { ...prev, fbSessionValid: false } : prev)
        window.dispatchEvent(new CustomEvent('postit-sync-done', { detail: { success: false, msg: '⚠️ חיבור הפייסבוק פג תוקף, יש להתחבר מחדש' } }))
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
    setPlatformFilter('all')
    setGroupFilter('all')
    setGroupFilterOpen(false)
    setGroupFilterSearch('')
    setTemplateFilter('all')
    setSortBy(activeTab === 'groups' ? 'name' : 'date')
    setFilterSheetOpen(false)
    const urlSubTab = searchParams.get('subTab')
    setCampaignSubTab((urlSubTab === 'scheduled' || urlSubTab === 'published') ? urlSubTab : 'all')
    window.scrollTo(0, 0)
  }, [activeTab])

  const hasActiveFilters = statusFilter !== 'all' || platformFilter !== 'all' || groupFilter !== 'all' || templateFilter !== 'all' || sortBy !== 'date'

  const resetFilters = () => {
    setStatusFilter('all')
    setPlatformFilter('all')
    setGroupFilter('all')
    setTemplateFilter('all')
    setSortBy(activeTab === 'groups' ? 'name' : 'date')
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
    if (dashDateRange.from) {
      const from = new Date(dashDateRange.from)
      from.setHours(0, 0, 0, 0)
      list = list.filter(c => new Date(c.createdAt) >= from)
    }
    if (dashDateRange.to) {
      const to = new Date(dashDateRange.to)
      to.setHours(23, 59, 59, 999)
      list = list.filter(c => new Date(c.createdAt) <= to)
    }
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

    if (platformFilter !== 'all') {
      if (platformFilter === 'facebook') {
        list = list.filter(c => (c.groupCount > 0 || c.publishToProfile) && !c.instagramEnabled)
      } else if (platformFilter === 'instagram') {
        list = list.filter(c => c.instagramEnabled && c.groupCount === 0 && !c.publishToProfile)
      } else if (platformFilter === 'both') {
        list = list.filter(c => c.instagramEnabled && (c.groupCount > 0 || c.publishToProfile))
      }
    }

    if (groupFilter !== 'all') {
      list = list.filter(c => c.groupNames?.includes(groupFilter))
    }
    if (templateFilter !== 'all') {
      if (templateFilter === '__none__') {
        list = list.filter(c => !c.templateName)
      } else {
        list = list.filter(c => c.templateName === templateFilter)
      }
    }
    if (sortBy === 'date') {
      list = [...list].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
    } else if (sortBy === 'name') {
      list = [...list].sort((a, b) => (a.title || a.content || '').localeCompare(b.title || b.content || ''))
    }
    return list
  }, [campaigns, search, statusFilter, platformFilter, groupFilter, templateFilter, sortBy, dashDateRange])

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
    if (dashDateRange.from) {
      const from = new Date(dashDateRange.from)
      from.setHours(0, 0, 0, 0)
      list = list.filter(p => new Date(p.publishedAt) >= from)
    }
    if (dashDateRange.to) {
      const to = new Date(dashDateRange.to)
      to.setHours(23, 59, 59, 999)
      list = list.filter(p => new Date(p.publishedAt) <= to)
    }
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
  }, [posts, search, statusFilter, groupFilter, sortBy, dashDateRange])

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

  const campaignTemplateNames = useMemo(() => {
    const names = [...new Set(campaigns.map(c => c.templateName).filter(Boolean))]
    return names.sort((a, b) => a.localeCompare(b))
  }, [campaigns])

  const campaignTemplateCounts = useMemo(() => {
    const counts = { '__none__': 0 }
    campaigns.forEach(c => {
      if (c.templateName) {
        counts[c.templateName] = (counts[c.templateName] || 0) + 1
      } else {
        counts['__none__']++
      }
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
    account: null,
  }

  const kpiData = {
    campaigns: filteredCampaigns.length,
    scheduled: filteredCampaigns.filter(c => c.status === 'scheduled' || c.status === 'recurring' || c.status === 'both').length,
    published: filteredCampaigns.reduce((sum, c) => sum + (c.publishedCount || 0), 0),
    groups: groups.length,
  }

  const campaignSubTabCounts = useMemo(() => ({
    all: filteredCampaigns.length,
    scheduled: filteredCampaigns.filter(c => c.status === 'scheduled' || c.status === 'recurring' || c.status === 'both').length,
    published: filteredCampaigns.filter(c => c.status === 'published' || c.publishedCount > 0).length,
  }), [filteredCampaigns])

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
                {user.profileImage || user.avatarUrl
                  ? <img src={(() => { const v = user.profileImage || user.avatarUrl; if (v.startsWith('/uploads')) return `http://localhost:8000${v}`; if (v.startsWith('uploads/')) return `http://localhost:8000/${v}`; return v })()} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                  : (user.name?.charAt(0) || user.email?.charAt(0) || '?')}
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
          {!authChecked ? (
            <div className="dash-loader">
              <img src="/logo.svg" alt="" className="loader-logo-pulse" />
            </div>
          ) : !dataReady ? (
            <div className="dash-loader">
              <img src="/logo.svg" alt="" className="loader-logo-pulse" />
            </div>
          ) : (
            <>
              {/* Facebook session banner — only show after data is loaded (avoids flash from stale cache) */}
              {user && !user.fbSessionValid && dataReady && !refreshing && (
                <div className="session-banner">
                  <span>⚠️ חשבון הפייסבוק לא מחובר, פוסטים מתוזמנים לא יפורסמו</span>
                  <button className="session-banner-btn" disabled={bootstrapping} onClick={handleBootstrap}>
                    {bootstrapping ? '⏳ ממתין לחיבור...' : '🔗 חבר עכשיו'}
                  </button>
                </div>
              )}

              {/* KPIs / Campaign Sub-tabs */}
              {activeTab !== 'account' && activeTab !== 'stats' && activeTab !== 'overview' && activeTab !== 'groups' && (
                <section className="kpi-row">
                  {activeTab === 'campaigns' ? (
                    <>
                      <div className={`kpi-card kpi-clickable ${campaignSubTab === 'all' ? 'kpi-active' : ''}`} onClick={() => setCampaignSubTab('all')}>
                        <div className="kpi-card-icon kpi-indigo">
                          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                            <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                          </svg>
                        </div>
                        <div className="kpi-card-data">
                          <span className="kpi-card-number">{campaignSubTabCounts.all}</span>
                          <span className="kpi-card-label">כל הקמפיינים</span>
                        </div>
                      </div>
                      <div className={`kpi-card kpi-clickable ${campaignSubTab === 'scheduled' ? 'kpi-active' : ''}`} onClick={() => setCampaignSubTab('scheduled')}>
                        <div className="kpi-card-icon kpi-emerald">
                          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                          </svg>
                        </div>
                        <div className="kpi-card-data">
                          <span className="kpi-card-number">{campaignSubTabCounts.scheduled}</span>
                          <span className="kpi-card-label">מתוזמנים</span>
                        </div>
                      </div>
                      <div className={`kpi-card kpi-clickable ${campaignSubTab === 'published' ? 'kpi-active' : ''}`} onClick={() => setCampaignSubTab('published')}>
                        <div className="kpi-card-icon kpi-violet">
                          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                            <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
                          </svg>
                        </div>
                        <div className="kpi-card-data">
                          <span className="kpi-card-number">{campaignSubTabCounts.published}</span>
                          <span className="kpi-card-label">קמפיינים שפורסמו</span>
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
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
                      <div className="kpi-card kpi-clickable" onClick={() => { setActiveTab('campaigns'); setCampaignSubTab('all'); }}>
                        <div className="kpi-card-icon kpi-indigo">
                          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                            <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                          </svg>
                        </div>
                        <div className="kpi-card-data">
                          <span className="kpi-card-number">{kpiData.campaigns}</span>
                          <span className="kpi-card-label">קמפיינים</span>
                        </div>
                      </div>
                      <div className="kpi-card kpi-clickable" onClick={() => { setActiveTab('campaigns'); setCampaignSubTab('scheduled'); }}>
                        <div className="kpi-card-icon kpi-emerald">
                          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                          </svg>
                        </div>
                        <div className="kpi-card-data">
                          <span className="kpi-card-number">{kpiData.scheduled}</span>
                          <span className="kpi-card-label">קמפיינים מתוזמנים</span>
                        </div>
                      </div>
                      <div className="kpi-card kpi-clickable" onClick={() => { setActiveTab('campaigns'); setCampaignSubTab('published'); }}>
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
                    </>
                  )}
                </section>
              )}

              {/* ─── FILTER BAR ─── */}
              {activeTab !== 'account' && activeTab !== 'stats' && activeTab !== 'overview' && (
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
                    {/* Date range picker */}
                    {(activeTab === 'campaigns' || activeTab === 'posts') && (
                      <div className="dash-date-wrap" ref={dashDateRef}>
                        <button className="dash-date-btn" onClick={() => setShowDashDatePicker(!showDashDatePicker)}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                          </svg>
                          {dashDateRange.from ? `${new Date(dashDateRange.from).toLocaleDateString('he-IL', { day: 'numeric', month: 'short' })} – ${new Date(dashDateRange.to).toLocaleDateString('he-IL', { day: 'numeric', month: 'short' })}` : 'כל התקופות'}
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
                        </button>
                        {showDashDatePicker && (
                          <StatsDateRangePicker
                            initialFrom={dashDateRange.from}
                            initialTo={dashDateRange.to}
                            onApply={(from, to) => { setDashDateRange({ from, to }); setShowDashDatePicker(false) }}
                            onCancel={() => setShowDashDatePicker(false)}
                          />
                        )}
                      </div>
                    )}

                    {activeTab === 'campaigns' && (
                      <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="filter-select">
                        <option value="all">כל הסטטוסים ({campaigns.length})</option>
                        {campaignStatusCounts['active'] && <option value="active">פעיל ({campaignStatusCounts['active']})</option>}
                        {campaignStatusCounts['published'] && <option value="published">פורסם ({campaignStatusCounts['published']})</option>}
                        {campaignStatusCounts['scheduled'] && <option value="scheduled">מתוזמן ({campaignStatusCounts['scheduled']})</option>}
                        {campaignStatusCounts['recurring'] && <option value="recurring">חוזר ({campaignStatusCounts['recurring']})</option>}
                        {campaignStatusCounts['paused'] && <option value="paused">מושהה ({campaignStatusCounts['paused']})</option>}
                        {campaignStatusCounts['draft'] && <option value="draft">טיוטה ({campaignStatusCounts['draft']})</option>}

                      </select>
                    )}

                    {activeTab === 'campaigns' && (
                      <select value={platformFilter} onChange={e => setPlatformFilter(e.target.value)} className="filter-select">
                        <option value="all">כל הפלטפורמות</option>
                        <option value="facebook">פייסבוק בלבד</option>
                        <option value="instagram">אינסטגרם בלבד</option>
                        <option value="both">פייסבוק + אינסטגרם</option>
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

                    {activeTab === 'campaigns' && campaignTemplateNames.length > 0 && (
                      <div className="group-filter-wrap" ref={templateFilterRef}>
                        <button
                          className={`filter-select group-filter-btn ${templateFilter !== 'all' ? 'active' : ''}`}
                          onClick={() => setTemplateFilterOpen(!templateFilterOpen)}
                        >
                          {templateFilter === 'all' ? `📝 כל הטמפלייטים` : templateFilter === '__none__' ? '📝 ללא טמפלייט' : `📝 ${templateFilter}`}
                        </button>
                        {templateFilterOpen && (
                          <div className="group-filter-dropdown">
                            <div className="group-filter-search">
                              <input
                                type="text"
                                placeholder="חפש טמפלייט..."
                                value={templateFilterSearch}
                                onChange={e => setTemplateFilterSearch(e.target.value)}
                                autoFocus
                              />
                            </div>
                            <div className="group-filter-list">
                              <button
                                className={`group-filter-item ${templateFilter === 'all' ? 'active' : ''}`}
                                onClick={() => { setTemplateFilter('all'); setTemplateFilterOpen(false); setTemplateFilterSearch('') }}
                              >
                                כל הטמפלייטים
                              </button>
                              <button
                                className={`group-filter-item ${templateFilter === '__none__' ? 'active' : ''}`}
                                onClick={() => { setTemplateFilter('__none__'); setTemplateFilterOpen(false); setTemplateFilterSearch('') }}
                              >
                                ללא טמפלייט
                              </button>
                              {campaignTemplateNames
                                .filter(name => !templateFilterSearch || name.toLowerCase().includes(templateFilterSearch.toLowerCase()))
                                .map(name => (
                                  <button
                                    key={name}
                                    className={`group-filter-item ${templateFilter === name ? 'active' : ''}`}
                                    onClick={() => { setTemplateFilter(name); setTemplateFilterOpen(false); setTemplateFilterSearch('') }}
                                  >
                                    {name}
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

                  {/* View toggle */}
                  {(activeTab === 'campaigns' || activeTab === 'posts' || activeTab === 'groups') && (
                    <button className="view-toggle-btn active" onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')} title={viewMode === 'grid' ? 'תצוגת שורות' : 'תצוגת ריבועים'}>
                      {viewMode === 'grid'
                        ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
                        : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
                      }
                    </button>
                  )}

                  {/* Groups refresh button */}
                  {activeTab === 'groups' && (
                    <button onClick={handleRefreshGroups} disabled={refreshingGroups} className="refresh-groups-btn">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={refreshingGroups ? 'spin' : ''}>
                        <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
                      </svg>
                      {refreshingGroups ? 'מסנכרן...' : 'רענן קבוצות'}
                    </button>
                  )}
                </div>
              )}

              {/* ─── MOBILE FILTER SHEET ─── */}
              {filterSheetOpen && (
                <>
                  <div className="filter-sheet-overlay" onClick={() => { setFilterSheetOpen(false); setSheetGroupExpand(false); setSheetTemplateExpand(false) }} />
                  <div className="filter-sheet">
                    <div className="filter-sheet-handle" />
                    <div className="filter-sheet-header">
                      <h3 className="filter-sheet-title">סינון ומיון</h3>
                      <button className="filter-sheet-reset" onClick={resetFilters}>איפוס</button>
                    </div>

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

                    {/* Platform filter */}
                    {activeTab === 'campaigns' && (
                      <div className="filter-sheet-section">
                        <label className="filter-sheet-label">פלטפורמה</label>
                        <div className="filter-sheet-chips">
                          {[
                            { value: 'all', label: 'הכל' },
                            { value: 'facebook', label: 'פייסבוק' },
                            { value: 'instagram', label: 'אינסטגרם' },
                            { value: 'both', label: 'שתיהן' },
                          ].map(opt => (
                            <button
                              key={opt.value}
                              className={`filter-chip ${platformFilter === opt.value ? 'active' : ''}`}
                              onClick={() => setPlatformFilter(opt.value)}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Group filter for campaigns */}
                    {activeTab === 'campaigns' && campaignGroupNames.length > 1 && (
                      <div className="filter-sheet-section">
                        <label className="filter-sheet-label">קבוצה</label>
                        <button className="filter-sheet-select-btn" onClick={() => { setSheetGroupExpand(!sheetGroupExpand); setSheetGroupSearch('') }}>
                          <span className="filter-sheet-select-value">{groupFilter === 'all' ? 'כל הקבוצות' : groupFilter}</span>
                          <svg className={`filter-sheet-chevron ${sheetGroupExpand ? 'open' : ''}`} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
                        </button>
                        {sheetGroupExpand && (
                          <div className="filter-sheet-select-panel">
                            <div className="filter-sheet-select-search">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                              <input type="text" placeholder="חפש קבוצה..." value={sheetGroupSearch} onChange={e => setSheetGroupSearch(e.target.value)} autoFocus />
                            </div>
                            <div className="filter-sheet-select-list">
                              <button className={`filter-sheet-select-item ${groupFilter === 'all' ? 'active' : ''}`} onClick={() => { setGroupFilter('all'); setSheetGroupExpand(false); setSheetGroupSearch('') }}>
                                <span>כל הקבוצות</span><span className="filter-sheet-select-count">{campaigns.length}</span>
                              </button>
                              {campaignGroupNames
                                .filter(name => !sheetGroupSearch || name.toLowerCase().includes(sheetGroupSearch.toLowerCase()))
                                .map(name => (
                                  <button key={name} className={`filter-sheet-select-item ${groupFilter === name ? 'active' : ''}`} onClick={() => { setGroupFilter(name); setSheetGroupExpand(false); setSheetGroupSearch('') }}>
                                    <span>{name}</span><span className="filter-sheet-select-count">{campaignGroupCounts[name] || 0}</span>
                                  </button>
                                ))
                              }
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Group filter for posts */}
                    {activeTab === 'posts' && postGroupNames.length > 1 && (
                      <div className="filter-sheet-section">
                        <label className="filter-sheet-label">קבוצה</label>
                        <button className="filter-sheet-select-btn" onClick={() => { setSheetGroupExpand(!sheetGroupExpand); setSheetGroupSearch('') }}>
                          <span className="filter-sheet-select-value">{groupFilter === 'all' ? 'כל הקבוצות' : groupFilter}</span>
                          <svg className={`filter-sheet-chevron ${sheetGroupExpand ? 'open' : ''}`} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
                        </button>
                        {sheetGroupExpand && (
                          <div className="filter-sheet-select-panel">
                            <div className="filter-sheet-select-search">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                              <input type="text" placeholder="חפש קבוצה..." value={sheetGroupSearch} onChange={e => setSheetGroupSearch(e.target.value)} autoFocus />
                            </div>
                            <div className="filter-sheet-select-list">
                              <button className={`filter-sheet-select-item ${groupFilter === 'all' ? 'active' : ''}`} onClick={() => { setGroupFilter('all'); setSheetGroupExpand(false); setSheetGroupSearch('') }}>
                                <span>כל הקבוצות</span><span className="filter-sheet-select-count">{posts.length}</span>
                              </button>
                              {postGroupNames
                                .filter(name => !sheetGroupSearch || name.toLowerCase().includes(sheetGroupSearch.toLowerCase()))
                                .map(name => (
                                  <button key={name} className={`filter-sheet-select-item ${groupFilter === name ? 'active' : ''}`} onClick={() => { setGroupFilter(name); setSheetGroupExpand(false); setSheetGroupSearch('') }}>
                                    <span>{name}</span><span className="filter-sheet-select-count">{postGroupCounts[name] || 0}</span>
                                  </button>
                                ))
                              }
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Template filter for campaigns */}
                    {activeTab === 'campaigns' && (
                      <div className="filter-sheet-section">
                        <label className="filter-sheet-label">טמפלייט</label>
                        <button className="filter-sheet-select-btn" onClick={() => { setSheetTemplateExpand(!sheetTemplateExpand); setSheetTemplateSearch('') }}>
                          <span className="filter-sheet-select-value">{templateFilter === 'all' ? 'כל הטמפלייטים' : templateFilter === '__none__' ? 'ללא טמפלייט' : templateFilter}</span>
                          <svg className={`filter-sheet-chevron ${sheetTemplateExpand ? 'open' : ''}`} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
                        </button>
                        {sheetTemplateExpand && (
                          <div className="filter-sheet-select-panel">
                            {campaignTemplateNames.length > 5 && (
                              <div className="filter-sheet-select-search">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                                <input type="text" placeholder="חפש טמפלייט..." value={sheetTemplateSearch} onChange={e => setSheetTemplateSearch(e.target.value)} autoFocus />
                              </div>
                            )}
                            <div className="filter-sheet-select-list">
                              <button className={`filter-sheet-select-item ${templateFilter === 'all' ? 'active' : ''}`} onClick={() => { setTemplateFilter('all'); setSheetTemplateExpand(false); setSheetTemplateSearch('') }}>
                                <span>כל הטמפלייטים</span><span className="filter-sheet-select-count">{campaigns.length}</span>
                              </button>
                              <button className={`filter-sheet-select-item ${templateFilter === '__none__' ? 'active' : ''}`} onClick={() => { setTemplateFilter('__none__'); setSheetTemplateExpand(false); setSheetTemplateSearch('') }}>
                                <span>ללא טמפלייט</span><span className="filter-sheet-select-count">{campaignTemplateCounts['__none__'] || 0}</span>
                              </button>
                              {campaignTemplateNames
                                .filter(name => !sheetTemplateSearch || name.toLowerCase().includes(sheetTemplateSearch.toLowerCase()))
                                .map(name => (
                                  <button key={name} className={`filter-sheet-select-item ${templateFilter === name ? 'active' : ''}`} onClick={() => { setTemplateFilter(name); setSheetTemplateExpand(false); setSheetTemplateSearch('') }}>
                                    <span>{name}</span><span className="filter-sheet-select-count">{campaignTemplateCounts[name] || 0}</span>
                                  </button>
                                ))
                              }
                            </div>
                          </div>
                        )}
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

                  </div>
                </>
              )}

              {/* Panel */}
              <div className="dash-panel">
                {activeTab === 'overview' && <DashboardOverview campaigns={campaigns} groups={groups} posts={posts} jobs={jobs} stats={stats} user={user} onUpdate={forceRefresh} onViewCampaign={(c, edit) => { setOverviewDetail(c); setOverviewEditMode(!!edit) }} />}
                {activeTab === 'campaigns' && <CampaignsPanel campaigns={filteredCampaigns} navigate={navigate} groups={groups} onUpdate={forceRefresh} viewMode={viewMode} posts={filteredPosts} subTab={campaignSubTab} />}
                {activeTab === 'groups' && <GroupsPanel groups={filteredGroups} navigate={navigate} sessionRequired={sessionRequired} viewMode={viewMode} />}
                {activeTab === 'posts' && <PostsPanel posts={filteredPosts} navigate={navigate} groups={groups} onUpdate={forceRefresh} viewMode={viewMode} />}
                {activeTab === 'stats' && (
                  <StatsPanel stats={stats} />
                )}
                {activeTab === 'account' && <AccountPanel user={user} logout={logout} setUser={setUser} navigate={navigate} handleBootstrap={handleBootstrap} bootstrapping={bootstrapping} />}
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

function CampaignsPanel({ campaigns, navigate, groups, onUpdate, viewMode, posts, subTab }) {
  const [tooltipId, setTooltipId] = useState(null)
  const [menuId, setMenuId] = useState(null)
  const [editCampaign, setEditCampaign] = useState(null)
  const [detailCampaign, setDetailCampaign] = useState(null)
  const [loading, setLoading] = useState(false)
  const [localCampaigns, setLocalCampaigns] = useState(campaigns)
  const [confirmAction, setConfirmAction] = useState(null)
  const [sortKey, setSortKey] = useState(null)
  const [sortDir, setSortDir] = useState('desc')
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
    published: 'פורסם',
  }

  const STATUS_CLASSES = {
    scheduled: 'badge-scheduled',
    paused: 'badge-paused',
    draft: 'badge-draft',
    recurring: 'badge-recurring',
    active: 'badge-active',
    published: 'badge-published',
  }

  const DAY_NAMES = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳']

  const subTabCampaigns = useMemo(() => {
    if (subTab === 'scheduled') return localCampaigns.filter(c => c.status === 'scheduled' || c.status === 'recurring' || c.status === 'both')
    if (subTab === 'published') return localCampaigns.filter(c => c.status === 'published' || c.publishedCount > 0)
    return localCampaigns
  }, [localCampaigns, subTab])

  const handleCampaignSort = (key) => {
    if (sortKey === key) setSortDir(prev => prev === 'desc' ? 'asc' : 'desc')
    else { setSortKey(key); setSortDir('desc') }
  }

  const sortedCampaigns = useMemo(() => {
    if (!sortKey) return subTabCampaigns
    return [...subTabCampaigns].sort((a, b) => {
      let valA, valB
      switch (sortKey) {
        case 'name': valA = a.title || a.content || ''; valB = b.title || b.content || ''; break
        case 'groups': valA = a.groupCount || 0; valB = b.groupCount || 0; break
        case 'status': valA = a.status || ''; valB = b.status || ''; break
        case 'exposure': valA = a.totalExposure || 0; valB = b.totalExposure || 0; break
        case 'date': valA = new Date(a.createdAt).getTime(); valB = new Date(b.createdAt).getTime(); break
        default: return 0
      }
      if (typeof valA === 'string') {
        const cmp = valA.localeCompare(valB, 'he')
        return sortDir === 'asc' ? cmp : -cmp
      }
      return sortDir === 'asc' ? valA - valB : valB - valA
    })
  }, [subTabCampaigns, sortKey, sortDir])

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

  const formatExposure = (n) => {
    if (!n) return '0'
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M'
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K'
    return n.toLocaleString()
  }

  const formatScheduledDate = (campaign) => {
    if ((campaign.status === 'scheduled' || campaign.status === 'recurring') && campaign.scheduledAt) {
      const d = new Date(campaign.scheduledAt)
      const now = new Date()
      const diffMs = d - now
      const diffH = Math.floor(diffMs / 3600000)
      const diffD = Math.floor(diffMs / 86400000)
      let relative = ''
      if (diffMs < 0) relative = ''
      else if (diffH < 1) relative = 'בעוד דקות'
      else if (diffH < 24) relative = `בעוד ${diffH} שעות`
      else if (diffD === 1) relative = 'מחר'
      else relative = `בעוד ${diffD} ימים`
      return {
        label: d.toLocaleDateString('he-IL', { day: 'numeric', month: 'short' }) + ' · ' + d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }),
        relative,
        isScheduled: true,
      }
    }
    return {
      label: new Date(campaign.createdAt).toLocaleDateString('he-IL', { day: 'numeric', month: 'short', year: 'numeric' }),
      relative: '',
      isScheduled: false,
    }
  }

  return (
    <>
    {!subTabCampaigns.length ? (
      <div className="empty-state">
        <p>{subTab === 'scheduled' ? 'אין קמפיינים מתוזמנים' : subTab === 'published' ? 'אין קמפיינים שפורסמו' : 'אין קמפיינים'}</p>
        {subTab === 'all' && <Link to="/create-post" className="empty-btn">+ צור קמפיין ראשון</Link>}
      </div>
    ) :
    viewMode === 'list' ? (
      /* ═══ Table/List View ═══ */
      <div className="cl-table">
        <div className="cl-header">
          <span className="cl-col cl-col-post cl-sortable" onClick={() => handleCampaignSort('name')}>
            פוסט {sortKey === 'name' && <span className="cl-sort-icon">{sortDir === 'asc' ? '↑' : '↓'}</span>}
          </span>
          <span className="cl-col cl-col-platform">
            פלטפורמות
          </span>
          <span className="cl-col cl-col-status cl-sortable" onClick={() => handleCampaignSort('status')}>
            סטטוס {sortKey === 'status' && <span className="cl-sort-icon">{sortDir === 'asc' ? '↑' : '↓'}</span>}
          </span>
          <span className="cl-col cl-col-date cl-sortable" onClick={() => handleCampaignSort('date')}>
            תאריך {sortKey === 'date' && <span className="cl-sort-icon">{sortDir === 'asc' ? '↑' : '↓'}</span>}
          </span>
          <span className="cl-col cl-col-actions"></span>
        </div>
        {sortedCampaigns.map(campaign => {
          const allImages = campaign.images?.length ? campaign.images : (campaign.imageUrl ? [campaign.imageUrl] : [])
          const resolveImg = (url) => url?.startsWith('/uploads') ? `http://localhost:8000${url}` : url
          const thumbImages = allImages.slice(0, 4)
          const extraImgs = allImages.length - 4
          return (
            <div key={campaign.id} className="cl-row" onClick={() => campaign.status === 'draft' ? navigate('/create-post', { state: { republish: { ...campaign, groupIds: campaign.groups?.map(g => g.id) } } }) : setDetailCampaign(campaign)}>
              {/* Post */}
              <div className="cl-col cl-col-post">
                <div className={`cl-thumb cl-thumb-${Math.min(thumbImages.length, 4)}`}>
                  {thumbImages.length > 0 ? (
                    <>
                      {thumbImages.map((img, i) => (
                        <div key={i} className="cl-thumb-cell">
                          <img src={resolveImg(img)} alt="" onError={e => e.target.style.display='none'} />
                        </div>
                      ))}
                      {extraImgs > 0 && <div className="cl-thumb-plus">+{extraImgs}</div>}
                    </>
                  ) : <div className="cl-thumb-placeholder">📝</div>}
                </div>
                <div className="cl-post-info">
                  <h4>{campaign.title || campaign.content?.slice(0, 40) || 'קמפיין'}</h4>
                  {campaign.content && <span className="cl-post-subtitle">{campaign.content.length > 50 ? campaign.content.slice(0, 50) + '...' : campaign.content}</span>}
                </div>
              </div>
              {/* Platform */}
              <div className="cl-col cl-col-platform">
                <div className="cl-platform-tags">
                  {(campaign.groupCount > 0 || campaign.publishToProfile) && <span className="platform-badge platform-facebook">FB</span>}
                  {campaign.instagramEnabled && <span className="platform-badge platform-instagram">IG</span>}
                </div>
              </div>
              {/* Status */}
              <div className="cl-col cl-col-status">
                <span className={`cl-status-badge ${STATUS_CLASSES[campaign.status] || 'badge-active'}`}>
                  {STATUS_LABELS[campaign.status] || campaign.status}
                </span>
              </div>
              {/* Date */}
              <div className="cl-col cl-col-date">
                {(() => {
                  const dateInfo = formatScheduledDate(campaign)
                  return (
                    <span className={`cl-date-val ${dateInfo.isScheduled ? 'cl-date-scheduled' : ''}`}>
                      {dateInfo.isScheduled ? (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                      ) : (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                      )}
                      <span>
                        {dateInfo.label}
                        {dateInfo.relative && <span className="cl-date-relative">{dateInfo.relative}</span>}
                      </span>
                    </span>
                  )
                })()}
              </div>
              {/* Actions */}
              <div className="cl-col cl-col-actions" onClick={e => e.stopPropagation()}>
                <div className="actions-menu-wrap" ref={menuId === campaign.id ? menuRef : undefined}>
                  <button className="actions-dots-btn" onClick={() => setMenuId(menuId === campaign.id ? null : campaign.id)}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>
                  </button>
                  {menuId === campaign.id && (
                    <div className="actions-dropdown">
                      {campaign.publishedCount > 0 && (
                        <button onClick={() => setDetailCampaign(campaign)}>היסטוריית פרסומים</button>
                      )}
                      {campaign.status !== 'draft' && (
                        <button onClick={() => handleEdit(campaign)}>ערוך</button>
                      )}
                      {campaign.status !== 'draft' && (campaign.isPaused ? (
                        <button onClick={() => handleRestart(campaign)}>הפעל מחדש</button>
                      ) : (
                        <button onClick={() => handlePause(campaign)}>השהה</button>
                      ))}
                      <button onClick={() => handleDuplicate(campaign)}>שכפל</button>
                      {campaign.status === 'draft' && (
                        <button onClick={() => navigate('/create-post', { state: { republish: { ...campaign, groupIds: campaign.groups?.map(g => g.id) } } })}>פרסם עכשיו</button>
                      )}
                      {campaign.status === 'draft' && (
                        <button onClick={() => { setMenuId(null); handleEdit(campaign) }}>ערוך</button>
                      )}
                      <button className="actions-danger" onClick={() => handleDelete(campaign)}>מחק</button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    ) : (
      /* ═══ Grid/Card View ═══ */
      <div className="campaigns-grid">
      {sortedCampaigns.map(campaign => {
        const allImages = campaign.images?.length ? campaign.images : (campaign.imageUrl ? [campaign.imageUrl] : [])
        const resolveImg = (url) => url?.startsWith('/uploads') ? `http://localhost:8000${url}` : url
        const handleImgError = (e) => { e.target.style.display = 'none'; e.target.parentElement.classList.add('card-img-broken') }
        const cardImages = allImages.slice(0, 3)
        const extraImgs = allImages.length - 3
        return (
        <div key={campaign.id} className="campaign-card">
          <div className={`campaign-card-visual card-imgs-${Math.min(allImages.length, 3)}`} onClick={() => campaign.status === 'draft' ? navigate('/create-post', { state: { republish: { ...campaign, groupIds: campaign.groups?.map(g => g.id) } } }) : setDetailCampaign(campaign)}>
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
            <span className={`campaign-badge ${STATUS_CLASSES[campaign.status] || 'badge-active'}`}>
              {STATUS_LABELS[campaign.status] || campaign.status}
            </span>
          </div>

          <div className="campaign-card-body">
            <div className="campaign-card-header">
              <h4 className="campaign-card-title" onClick={() => campaign.status === 'draft' ? navigate('/create-post', { state: { republish: { ...campaign, groupIds: campaign.groups?.map(g => g.id) } } }) : setDetailCampaign(campaign)}>                {campaign.title || campaign.content?.slice(0, 40) || 'קמפיין'}
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
                    {campaign.status !== 'draft' && (campaign.isPaused ? (
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
                      <button onClick={() => navigate('/create-post', { state: { republish: { ...campaign, groupIds: campaign.groups?.map(g => g.id) } } })}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                        פרסם עכשיו
                      </button>
                    )}
                    {campaign.status === 'draft' && (
                      <button onClick={() => { setMenuId(null); handleEdit(campaign) }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        ערוך
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

            {/* Group avatars */}
            <div className="campaign-card-groups">
              <div className="campaign-card-avatars">
                {(campaign.groups || []).slice(0, 3).map((g, i) => (
                  <div key={i} className="campaign-card-avatar" title={g.name}>
                    {g.image ? <img src={g.image} alt="" onError={e => { e.target.style.display='none'; e.target.nextSibling && (e.target.nextSibling.style.display='flex') }} /> : null}
                    <span style={g.image ? { display: 'none' } : {}}>{g.name?.[0] || '?'}</span>
                  </div>
                ))}
                {(campaign.groupCount || 0) > 3 && <span className="campaign-card-avatar-more">+{campaign.groupCount - 3}</span>}
              </div>
              <span className="campaign-card-group-label">
                {campaign.groupCount === 1 ? campaign.groupNames?.[0] || 'קבוצה אחת' : campaign.groupCount > 0 ? `${campaign.groupCount} קבוצות` : ''}
              </span>
            </div>

            {/* Platform badges */}
            <div className="campaign-card-platforms">
              {(campaign.groupCount > 0 || campaign.publishToProfile) && (
                <span className="platform-badge platform-facebook">פייסבוק{campaign.publishToProfile ? ' + פרופיל' : ''}</span>
              )}
              {campaign.instagramEnabled && (
                <span className="platform-badge platform-instagram">
                  אינסטגרם{campaign.instagramPublishType === 'STORY' ? ' · סטורי' : campaign.instagramPublishType === 'REEL' ? ' · ריל' : ' · פיד'}
                </span>
              )}
            </div>

            {/* Footer: exposure | date */}
            <div className="campaign-card-footer">
              <span className="campaign-card-exposure" title="חשיפה">
                {formatExposure(campaign.totalExposure)}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              </span>
              <span className="campaign-card-date">
                {(() => {
                  const dateInfo = formatScheduledDate(campaign)
                  return dateInfo.isScheduled
                    ? <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> {dateInfo.label}</>
                    : dateInfo.label
                })()}
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
    )}

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
  const [sortKey, setSortKey] = useState(null) // 'name' | 'members' | 'posts' | 'scheduled'
  const [sortDir, setSortDir] = useState('desc') // 'asc' | 'desc'
  const sentinelRef = useRef(null)

  // Infinite scroll
  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(([entry]) => { // eslint-disable-line no-undef
      if (entry.isIntersecting) setVisibleCount(prev => prev + 15)
    }, { rootMargin: '200px' })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir(prev => prev === 'desc' ? 'asc' : 'desc')
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  const sortedGroups = useMemo(() => {
    if (!sortKey) return groups
    const sorted = [...groups].sort((a, b) => {
      let valA, valB
      switch (sortKey) {
        case 'name': valA = a.name || ''; valB = b.name || ''; break
        case 'members': valA = a.memberCount || 0; valB = b.memberCount || 0; break
        case 'posts': valA = a.postsCount || 0; valB = b.postsCount || 0; break
        case 'scheduled': valA = a.scheduledCount || 0; valB = b.scheduledCount || 0; break
        default: return 0
      }
      if (sortKey === 'name') {
        const cmp = valA.localeCompare(valB, 'he')
        return sortDir === 'asc' ? cmp : -cmp
      }
      return sortDir === 'asc' ? valA - valB : valB - valA
    })
    return sorted
  }, [groups, sortKey, sortDir])

  const visibleGroups = sortedGroups.slice(0, visibleCount)
  const hasMore = sortedGroups.length > visibleCount

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
            <span className="gl-col gl-col-name gl-sortable" onClick={() => handleSort('name')}>
              קבוצה ({groups.length}) {sortKey === 'name' && <span className="gl-sort-icon">{sortDir === 'asc' ? '↑' : '↓'}</span>}
            </span>
            <span className="gl-col gl-col-members gl-sortable" onClick={() => handleSort('members')}>
              חברים {sortKey === 'members' && <span className="gl-sort-icon">{sortDir === 'asc' ? '↑' : '↓'}</span>}
            </span>
            <span className="gl-col gl-col-posts gl-sortable" onClick={() => handleSort('posts')}>
              פוסטים שפורסמו {sortKey === 'posts' && <span className="gl-sort-icon">{sortDir === 'asc' ? '↑' : '↓'}</span>}
            </span>
            <span className="gl-col gl-col-scheduled gl-sortable" onClick={() => handleSort('scheduled')}>
              פוסטים מתוזמנים {sortKey === 'scheduled' && <span className="gl-sort-icon">{sortDir === 'asc' ? '↑' : '↓'}</span>}
            </span>
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
                  <h4>{normalizeFancyText(group.name)}</h4>
                  <span className="gl-privacy">{group.privacyType === 'private' ? 'קבוצה פרטית' : 'קבוצה ציבורית'}</span>
                </div>
              </div>
              <div className="gl-col gl-col-members">
                <span className="gl-stat-label">חברים</span>
                <span className="gl-stat-value">{group.memberCount ? (group.memberCount >= 1000 ? (group.memberCount / 1000).toFixed(1) + 'K' : group.memberCount.toLocaleString()) : '—'}</span>
              </div>
              <div className="gl-col gl-col-posts">
                <span className="gl-stat-label">פורסמו</span>
                <span className="gl-stat-value">{group.postsCount || 0}</span>
              </div>
              <div className="gl-col gl-col-scheduled">
                <span className="gl-stat-label">מתוזמנים</span>
                <span className="gl-stat-value">{group.scheduledCount || 0}</span>
              </div>
              <div className="gl-col gl-col-action">
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
                <h4>{normalizeFancyText(group.name)}</h4>
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

      {/* Infinite scroll sentinel */}
      {hasMore && <div ref={sentinelRef} style={{ height: 1 }} />}

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
                <h3 className="gd-hero-title">{normalizeFancyText(detailGroup.name)}</h3>
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
      <Link to="/create-post" className="empty-btn">+ צור קמפיין</Link>
    </div>
  )

  const resolveImg = (url) => url?.startsWith('/uploads') ? `http://localhost:8000${url}` : url
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
                    {item.postUrl && (
                      <button onClick={(e) => { e.stopPropagation(); setMenuId(null); window.open(item.postUrl, '_blank', 'noopener,noreferrer') }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                        צפה בפוסט בפייסבוק
                      </button>
                    )}
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

function StatsDateRangePicker({ initialFrom, initialTo, onApply, onCancel }) {
  const toDS = (d) => d.toISOString().split('T')[0]
  const [calMonth, setCalMonth] = useState(() => {
    const d = initialFrom ? new Date(initialFrom) : new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })
  const [rangeStart, setRangeStart] = useState(initialFrom || '')
  const [rangeEnd, setRangeEnd] = useState(initialTo || '')
  const [hoverDate, setHoverDate] = useState(null)
  const [manualFrom, setManualFrom] = useState(initialFrom || '')
  const [manualTo, setManualTo] = useState(initialTo || '')

  const year = calMonth.getFullYear()
  const month = calMonth.getMonth()
  const monthName = calMonth.toLocaleDateString('he-IL', { month: 'long', year: 'numeric' })
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const today = new Date()
  const days = []
  for (let i = 0; i < firstDay; i++) days.push(null)
  for (let d = 1; d <= daysInMonth; d++) days.push(d)

  const dayToStr = (day) => toDS(new Date(year, month, day))
  const isInRange = (day) => {
    if (!day) return false
    const ds = dayToStr(day)
    const end = rangeEnd || hoverDate || ''
    if (!rangeStart) return false
    if (!end) return ds === rangeStart
    const min = rangeStart < end ? rangeStart : end
    const max = rangeStart < end ? end : rangeStart
    return ds >= min && ds <= max
  }
  const isStart = (day) => day && dayToStr(day) === rangeStart
  const isEnd = (day) => day && dayToStr(day) === (rangeEnd || hoverDate)

  const handleDayClick = (day) => {
    const ds = dayToStr(day)
    if (!rangeStart || rangeEnd) {
      setRangeStart(ds); setRangeEnd(''); setManualFrom(ds); setManualTo('')
    } else {
      let from = rangeStart, to = ds
      if (from > to) [from, to] = [to, from]
      setRangeStart(from); setRangeEnd(to); setManualFrom(from); setManualTo(to)
      onApply(from, to)
    }
  }

  const handlePreset = (numDays) => {
    const to = toDS(new Date())
    const from = toDS(new Date(Date.now() - numDays * 24 * 60 * 60 * 1000))
    onApply(from, to)
  }
  const handleTodayPreset = () => { const t = toDS(new Date()); onApply(t, t) }
  const handleManualApply = () => {
    if (manualFrom) {
      const to = manualTo || toDS(new Date())
      manualFrom > to ? onApply(to, manualFrom) : onApply(manualFrom, to)
    }
  }

  return (
    <div className="drp-dropdown">
      <div className="drp-calendar">
        <div className="drp-cal-nav">
          <button onClick={() => setCalMonth(new Date(year, month - 1, 1))}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <span>{monthName}</span>
          <button onClick={() => setCalMonth(new Date(year, month + 1, 1))}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </div>
        <div className="drp-cal-grid">
          {['א׳','ב׳','ג׳','ד׳','ה׳','ו׳','ש׳'].map(d => <span key={d} className="drp-weekday">{d}</span>)}
          {days.map((day, i) => (
            <span key={i}
              className={`drp-day ${!day ? 'empty' : ''} ${day && isInRange(day) ? 'in-range' : ''} ${day && isStart(day) ? 'range-start' : ''} ${day && isEnd(day) ? 'range-end' : ''} ${day && dayToStr(day) === toDS(today) ? 'today' : ''}`}
              onClick={() => day && handleDayClick(day)}
              onMouseEnter={() => { if (rangeStart && !rangeEnd && day) setHoverDate(dayToStr(day)) }}
            >{day || ''}</span>
          ))}
        </div>
      </div>
      <div className="drp-inputs">
        <div className="drp-input-group"><label>מ-</label><input type="date" value={manualFrom} onChange={e => { setManualFrom(e.target.value); setRangeStart(e.target.value) }} onKeyDown={e => e.key === 'Enter' && handleManualApply()} /></div>
        <div className="drp-input-group"><label>עד</label><input type="date" value={manualTo} onChange={e => { setManualTo(e.target.value); setRangeEnd(e.target.value) }} onKeyDown={e => e.key === 'Enter' && handleManualApply()} /></div>
      </div>
      <div className="drp-presets">
        <button onClick={handleTodayPreset}>היום</button>
        <button onClick={() => handlePreset(7)}>7 ימים</button>
        <button onClick={() => handlePreset(30)}>30 ימים</button>
      </div>
      <div className="drp-actions">
        <button className="drp-cancel" onClick={onCancel}>ביטול</button>
        <button className="drp-apply" onClick={handleManualApply}>החל</button>
      </div>
    </div>
  )
}

function BestPostingTimesChart({ hourlyData: data }) {
  const [timesChartType, setTimesChartType] = useState('area')
  const [timesChartRef, timesChartSize] = useContainerSize()

  if (!data?.length) return null

  return (
    <div className="stats-chart-card">
      <div className="stats-chart-header">
        <h4>🕐 שעות פרסום מומלצות</h4>
        <div className="chart-type-toggle">
          <button className={`chart-toggle-btn ${timesChartType === 'area' ? 'active' : ''}`} onClick={() => setTimesChartType('area')} title="גרף קו">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
          </button>
          <button className={`chart-toggle-btn ${timesChartType === 'bar' ? 'active' : ''}`} onClick={() => setTimesChartType('bar')} title="גרף עמודות">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="12" width="4" height="9"/><rect x="10" y="7" width="4" height="14"/><rect x="17" y="3" width="4" height="18"/></svg>
          </button>
        </div>
      </div>
      <div className="stats-chart-container" ref={timesChartRef}>
        {timesChartType === 'bar' ? (
            <BarChart width={timesChartSize.width || 300} height={timesChartSize.height || 220} data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <XAxis dataKey="label" tick={{ fill: '#6b7684', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#6b7684', fontSize: 11 }} axisLine={false} tickLine={false} width={35} />
              <Tooltip
                cursor={false}
                contentStyle={{ background: '#1e2028', border: '1px solid #2a2f3a', borderRadius: 8, color: '#e2e8f0' }}
                formatter={(val, name) => [val, name === 'avgLikes' ? 'ממוצע לייקים' : name === 'avgComments' ? 'ממוצע תגובות' : name]}
                labelFormatter={(label) => `שעה ${label}`}
              />
              <Bar dataKey="avgLikes" fill="#818cf8" radius={[4, 4, 0, 0]} name="avgLikes" background={false} />
              <Bar dataKey="avgComments" fill="#10B981" radius={[4, 4, 0, 0]} name="avgComments" background={false} />
            </BarChart>
          ) : (
            <AreaChart width={timesChartSize.width || 300} height={timesChartSize.height || 220} data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="timesLikesGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#818cf8" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#818cf8" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="timesCommentsGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10B981" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#10B981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="label" tick={{ fill: '#6b7684', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#6b7684', fontSize: 11 }} axisLine={false} tickLine={false} width={35} />
              <Tooltip
                cursor={false}
                contentStyle={{ background: '#1e2028', border: '1px solid #2a2f3a', borderRadius: 8, color: '#e2e8f0' }}
                formatter={(val, name) => [val, name === 'avgLikes' ? 'ממוצע לייקים' : name === 'avgComments' ? 'ממוצע תגובות' : name]}
                labelFormatter={(label) => `שעה ${label}`}
              />
              <Area type="monotone" dataKey="avgLikes" stroke="#818cf8" strokeWidth={2} fill="url(#timesLikesGrad)" name="avgLikes" activeDot={{ r: 6, fill: '#818cf8', stroke: '#fff', strokeWidth: 2 }} />
              <Area type="monotone" dataKey="avgComments" stroke="#10B981" strokeWidth={2} fill="url(#timesCommentsGrad)" name="avgComments" activeDot={{ r: 6, fill: '#10B981', stroke: '#fff', strokeWidth: 2 }} />
            </AreaChart>
          )}
      </div>
      <p className="best-times-hint">ממוצע לייקים ותגובות לפי שעת פרסום</p>
    </div>
  )
}

function StatsPanel({ stats }) {
  const navigate = useNavigate()
  const toDS = (d) => d.toISOString().split('T')[0]
  const defaultRange = useMemo(() => {
    const to = new Date()
    const from = new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000)
    return { from: toDS(from), to: toDS(to) }
  }, [])

  const [dateRange, setDateRange] = useState(defaultRange)
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [chartType, setChartType] = useState('area') // 'area' or 'bar'
  const [exposureChartRef, exposureChartSize] = useContainerSize()

  // Top posts state
  const [topPostsSort, setTopPostsSort] = useState('likes')
  const [topPostsPlatform, setTopPostsPlatform] = useState('all')
  const [refreshingAll, setRefreshingAll] = useState(false)

  // Cache helpers
  const getCacheKey = useCallback((from, to) => `postit_stats_${from}_${to}`, [])
  const getTopPostsCacheKey = useCallback((sort, from, to) => `postit_top_posts_${sort}_${from}_${to}`, [])
  const getCached = useCallback((from, to) => {
    try {
      const raw = localStorage.getItem(getCacheKey(from, to))
      if (!raw) return null
      const cached = JSON.parse(raw)
      return cached.data || null
    } catch { /* ignore */ }
    return null
  }, [getCacheKey])
  const isCacheStale = useCallback((from, to) => {
    try {
      const raw = localStorage.getItem(getCacheKey(from, to))
      if (!raw) return true
      const cached = JSON.parse(raw)
      return Date.now() - cached.ts > 2 * 60 * 1000
    } catch { return true }
  }, [getCacheKey])
  const getTopPostsCached = useCallback((sort, from, to) => {
    try {
      const raw = localStorage.getItem(getTopPostsCacheKey(sort, from, to))
      if (!raw) return null
      const cached = JSON.parse(raw)
      return cached.data || null
    } catch { /* ignore */ }
    return null
  }, [getTopPostsCacheKey])
  const isTopPostsCacheStale = useCallback((sort, from, to) => {
    try {
      const raw = localStorage.getItem(getTopPostsCacheKey(sort, from, to))
      if (!raw) return true
      const cached = JSON.parse(raw)
      return Date.now() - cached.ts > 2 * 60 * 1000
    } catch { return true }
  }, [getTopPostsCacheKey])
  const setCache = useCallback((from, to, data) => {
    try {
      localStorage.setItem(getCacheKey(from, to), JSON.stringify({ data, ts: Date.now() }))
    } catch { /* ignore */ }
  }, [getCacheKey])
  const setTopPostsCache = useCallback((sort, from, to, data) => {
    try {
      localStorage.setItem(getTopPostsCacheKey(sort, from, to), JSON.stringify({ data, ts: Date.now() }))
    } catch { /* ignore */ }
  }, [getTopPostsCacheKey])

  const [topPosts, setTopPosts] = useState(() => getTopPostsCached(topPostsSort, defaultRange.from, defaultRange.to) || [])
  const [topPostsLoading, setTopPostsLoading] = useState(() => !getTopPostsCached(topPostsSort, defaultRange.from, defaultRange.to))
  const [topPostsVisible, setTopPostsVisible] = useState(10)
  const [expandedPostId, setExpandedPostId] = useState(null)

  const [exposure, setExposure] = useState(() => getCached(defaultRange.from, defaultRange.to))
  const [loading, setLoading] = useState(!exposure)

  const loadExposure = useCallback(async (from, to, forceRefresh) => {
    const cached = getCached(from, to)
    if (cached) {
      setExposure(cached)
      setLoading(false)
      if (!forceRefresh && !isCacheStale(from, to)) return
    } else {
      setLoading(true)
    }
    try {
      const params = {}
      if (from) params.from = from
      if (to) params.to = to
      const exposureRes = await groupsService.getExposure(params)
      if (exposureRes.data?.exposure) {
        setExposure(exposureRes.data.exposure)
        setCache(from, to, exposureRes.data.exposure)
      }
    } catch { /* ignore */ }
    setLoading(false)
  }, [getCached, isCacheStale, setCache])

  const loadTopPosts = useCallback(async (sort, from, to, forceRefresh) => {
    const cached = getTopPostsCached(sort, from, to)
    if (cached) {
      setTopPosts(cached)
      setTopPostsLoading(false)
      if (!forceRefresh && !isTopPostsCacheStale(sort, from, to)) return
    } else {
      setTopPostsLoading(true)
    }
    try {
      const res = await groupsService.getTopPosts({ sort, limit: 30, from, to })
      if (res.data?.posts) {
        setTopPosts(res.data.posts)
        setTopPostsCache(sort, from, to, res.data.posts)
      }
    } catch { /* ignore */ }
    setTopPostsLoading(false)
  }, [getTopPostsCached, isTopPostsCacheStale, setTopPostsCache])

  useEffect(() => {
    loadExposure(dateRange.from, dateRange.to)
  }, [dateRange, loadExposure])

  useEffect(() => {
    setTopPostsVisible(10)
    setExpandedPostId(null)
    loadTopPosts(topPostsSort, dateRange.from, dateRange.to)
  }, [topPostsSort, dateRange, loadTopPosts])

  const formatDateRangeLabel = (from, to) => {
    const f = new Date(from)
    const t = new Date(to)
    return `${f.toLocaleDateString('he-IL', { day: 'numeric', month: 'short' })} - ${t.toLocaleDateString('he-IL', { day: 'numeric', month: 'short', year: 'numeric' })}`
  }

  const formatNumber = (n) => {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M'
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K'
    return n?.toLocaleString?.() || '0'
  }

  const chartData = useMemo(() => {
    if (!exposure?.data) return []
    return fillDateRange(exposure.data, dateRange.from, dateRange.to).map(d => ({
      date: new Date(d.date).toLocaleDateString('he-IL', { day: 'numeric', month: 'short' }),
      exposure: d.exposure,
      posts: d.posts,
    }))
  }, [exposure, dateRange])

  return (
    <div className="stats-layout">
      {/* Date range selector */}
      <div className="stats-period-bar">
        <div className="overview-date-wrap">
          <div className="overview-date-range" onClick={() => setShowDatePicker(!showDatePicker)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
            <span>{formatDateRangeLabel(dateRange.from, dateRange.to)}</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
          </div>
          {showDatePicker && (
            <StatsDateRangePicker
              initialFrom={dateRange.from}
              initialTo={dateRange.to}
              onApply={(from, to) => { setDateRange({ from, to }); setShowDatePicker(false) }}
              onCancel={() => setShowDatePicker(false)}
            />
          )}
        </div>
      </div>

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
          <div className="stats-chart-header">
            <h4>חשיפה לאורך זמן</h4>
            <div className="chart-type-toggle">
              <button className={`chart-toggle-btn ${chartType === 'area' ? 'active' : ''}`} onClick={() => setChartType('area')} title="גרף קו">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
              </button>
              <button className={`chart-toggle-btn ${chartType === 'bar' ? 'active' : ''}`} onClick={() => setChartType('bar')} title="גרף עמודות">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="12" width="4" height="9"/><rect x="10" y="7" width="4" height="14"/><rect x="17" y="3" width="4" height="18"/></svg>
              </button>
            </div>
          </div>
          <div className="stats-chart-container" ref={exposureChartRef}>
            {chartType === 'area' ? (
                <AreaChart width={exposureChartSize.width || 300} height={exposureChartSize.height || 220} data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="exposureGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#818cf8" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="#818cf8" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" tick={{ fill: '#6b7684', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#6b7684', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={formatNumber} domain={[0, 'auto']} width={35} />
                  <Tooltip
                    cursor={false}
                    contentStyle={{ background: '#1e2028', border: '1px solid #2a2f3a', borderRadius: 8, color: '#e2e8f0' }}
                    formatter={(val) => [formatNumber(val), 'חשיפה']}
                  />
                  <Area type={chartData.length >= 2 ? 'monotone' : 'linear'} dataKey="exposure" stroke="#818cf8" strokeWidth={2} fill="url(#exposureGradient)" dot={{ r: 5, fill: '#818cf8', stroke: '#1e2028', strokeWidth: 2 }} activeDot={{ r: 7, fill: '#818cf8', stroke: '#fff', strokeWidth: 2 }} />
                </AreaChart>
              ) : (
                <BarChart width={exposureChartSize.width || 300} height={exposureChartSize.height || 220} data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <XAxis dataKey="date" tick={{ fill: '#6b7684', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#6b7684', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={formatNumber} width={35} />
                  <Tooltip
                    cursor={false}
                    contentStyle={{ background: '#1e2028', border: '1px solid #2a2f3a', borderRadius: 8, color: '#e2e8f0' }}
                    formatter={(val) => [formatNumber(val), 'חשיפה']}
                  />
                  <Bar dataKey="exposure" fill="#818cf8" radius={[4, 4, 0, 0]} background={false} />
                </BarChart>
              )}
          </div>
        </div>
      )}

      {/* Top Groups Table */}
      {exposure?.topGroups?.length > 0 && (
        <div className="stats-chart-card">
          <h4>🏆 קבוצות מובילות בחשיפה</h4>
          <div className="top-groups-table">
            {exposure.topGroups.map((g, i) => (
              <div key={g.id} className={`top-group-row top-group-clickable ${i === 0 ? 'top-group-gold' : i === 1 ? 'top-group-silver' : ''}`} onClick={() => navigate(`/group/${g.id}`)}>
                <span className="top-group-rank">{i + 1}</span>
                <div className="top-group-info">
                  <span className="top-group-name">{g.name}</span>
                  {g.privacyType && <span className="top-group-privacy">{g.privacyType === 'private' ? '🔒' : '🌐'}</span>}
                </div>
                <span className="top-group-members">{formatNumber(g.memberCount)} חברים</span>
                <span className="top-group-arrow">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Publications by group */}
      {stats?.groupStats?.length > 0 && (
        <div className="stats-chart-card">
          <h4>פרסומים לפי קבוצה</h4>
          <div className="bar-chart">
            {stats.groupStats.slice(0, 5).map(g => {
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

      {/* Top posts by engagement */}
      <div className="stats-chart-card">
        <div className="top-posts-header">
          <h4>🏅 פוסטים מובילים</h4>
          <div className="top-posts-actions">
            <button
              className={`top-posts-refresh-btn ${refreshingAll ? 'spinning' : ''}`}
              onClick={() => {
                if (refreshingAll) return
                setRefreshingAll(true)
                window.dispatchEvent(new CustomEvent('postit-op-start', {
                  detail: { id: 'refresh-all-metrics', msg: '🔄 מרענן נתוני מעורבות מפייסבוק ואינסטגרם... ניתן להמשיך לגלוש באתר' }
                }))
                groupsService.refreshAllMetrics()
                  .then(async (refreshRes) => {
                    // Reload top posts with current date range
                    const res = await groupsService.getTopPosts({
                      sort: topPostsSort, limit: 30,
                      from: dateRange.from, to: dateRange.to,
                    })
                    if (res.data?.posts) {
                      setTopPosts(res.data.posts)
                      setTopPostsCache(topPostsSort, dateRange.from, dateRange.to, res.data.posts)
                    }
                    const count = refreshRes.data?.refreshed || 0
                    window.dispatchEvent(new CustomEvent('postit-op-done', {
                      detail: { id: 'refresh-all-metrics', success: true, msg: `✅ רענון הושלם! עודכנו ${count} פרסומים` }
                    }))
                  })
                  .catch(() => {
                    window.dispatchEvent(new CustomEvent('postit-op-done', {
                      detail: { id: 'refresh-all-metrics', success: false, msg: '⚠️ שגיאה ברענון נתוני מעורבות' }
                    }))
                  })
                  .finally(() => setRefreshingAll(false))
              }}
              disabled={refreshingAll}
              title="רענן נתוני מעורבות (30 ימים אחרונים)"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={refreshingAll ? 'spin' : ''}>
                <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
                <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
              </svg>
              {refreshingAll ? 'מרענן...' : 'רענן'}
            </button>
            <div className="top-posts-toggle">
              <button className={topPostsSort === 'likes' ? 'active' : ''} onClick={() => setTopPostsSort('likes')}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3H14z"/><path d="M7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3"/></svg>
                לייקים
              </button>
              <button className={topPostsSort === 'comments' ? 'active' : ''} onClick={() => setTopPostsSort('comments')}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
                תגובות
              </button>
            </div>
          </div>
        </div>
        <div className="top-posts-platform-filter">
          <button className={`top-posts-platform-btn ${topPostsPlatform === 'all' ? 'active' : ''}`} onClick={() => setTopPostsPlatform('all')}>הכל</button>
          <button className={`top-posts-platform-btn ${topPostsPlatform === 'facebook' ? 'active' : ''}`} onClick={() => setTopPostsPlatform('facebook')}>Facebook</button>
          <button className={`top-posts-platform-btn ${topPostsPlatform === 'instagram' ? 'active' : ''}`} onClick={() => setTopPostsPlatform('instagram')}>Instagram</button>
        </div>
        {topPostsLoading ? (
          <div className="top-posts-loading">טוען...</div>
        ) : topPosts.length === 0 ? (
          <div className="top-posts-empty">
            <p>אין עדיין נתוני מעורבות. לחץ על כפתור הרענון (🔄) ליד כל פרסום כדי למשוך לייקים ותגובות.</p>
          </div>
        ) : (() => {
          const filtered = topPosts.filter(p => {
            if (topPostsPlatform === 'all') return true
            if (topPostsPlatform === 'facebook') return (p.platform || 'FACEBOOK') === 'FACEBOOK'
            if (topPostsPlatform === 'instagram') return p.platform === 'INSTAGRAM'
            return true
          })
          return filtered.length === 0 ? (
            <div className="top-posts-empty">
              <p>אין פוסטים עבור הפלטפורמה שנבחרה</p>
            </div>
          ) : (
          <div className="top-posts-list">
            {filtered.slice(0, topPostsVisible).map((p, i) => (
              <Fragment key={p.id}>
                <div
                  className={`top-post-row ${i === 0 ? 'top-post-gold' : i === 1 ? 'top-post-silver' : i === 2 ? 'top-post-bronze' : ''} ${expandedPostId === p.id ? 'top-post-expanded' : ''}`}
                  onClick={() => setExpandedPostId(expandedPostId === p.id ? null : p.id)}
                  style={{ cursor: 'pointer' }}
                >
                  <span className="top-post-rank">{i + 1}</span>
                  <div className="top-post-info">
                    <span className="top-post-title">{p.title || 'ללא כותרת'}</span>
                    <span className="top-post-group">
                      <span className={`top-post-platform-badge ${p.platform === 'INSTAGRAM' ? 'ig' : 'fb'}`}>
                        {p.platform === 'INSTAGRAM' ? (p.igType === 'REEL' ? 'ריל' : p.igType === 'STORY' ? 'סטורי' : 'פוסט IG') : 'Facebook'}
                      </span>
                      {p.groupName ? ` • ${p.groupName}` : ''}
                    </span>
                  </div>
                  <div className="top-post-metrics">
                    <span className="top-post-metric" title="לייקים">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3H14z"/><path d="M7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3"/></svg>
                      {p.likes}
                    </span>
                    <span className="top-post-metric" title="תגובות">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
                      {p.comments}
                    </span>
                  </div>
                  <span className="top-post-expand-icon">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ transform: expandedPostId === p.id ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                      <polyline points="6 9 12 15 18 9"/>
                    </svg>
                  </span>
                </div>
                {expandedPostId === p.id && (
                  <div className="top-post-details">
                    {p.content && (
                      <div className="top-post-content">
                        <p>{p.content}</p>
                      </div>
                    )}
                    <div className="top-post-meta">
                      {p.publishedAt && (
                        <span className="top-post-date">
                          📅 {new Date(p.publishedAt).toLocaleDateString('he-IL', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                      {p.groupName && <span className="top-post-group-badge">📍 {p.groupName}</span>}
                    </div>
                    {p.externalPostUrl && (
                      <a href={p.externalPostUrl} target="_blank" rel="noopener noreferrer" className="top-post-fb-link">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                        {p.platform === 'INSTAGRAM' ? 'צפה בפוסט באינסטגרם' : 'צפה בפוסט בפייסבוק'}
                      </a>
                    )}
                  </div>
                )}
              </Fragment>
            ))}
            {filtered.length > topPostsVisible && (
              <button className="top-posts-show-more" onClick={() => setTopPostsVisible(prev => prev + 10)}>
                הצג עוד ({filtered.length - topPostsVisible} נוספים)
              </button>
            )}
          </div>
          )
        })()}
      </div>

      {/* Best Posting Times */}
      <BestPostingTimesChart hourlyData={stats?.hourlyEngagement} />

      {loading && !exposure && (
        <div className="empty-state"><p>טוען נתונים...</p></div>
      )}
    </div>
  )
}

function AccountPanel({ user, logout, setUser, navigate, handleBootstrap, bootstrapping }) {
  return (
    <SettingsPanel user={user} logout={logout} setUser={setUser} navigate={navigate} handleBootstrap={handleBootstrap} bootstrapping={bootstrapping} />
  )
}

function BillingPanel({ user, navigate }) {
  const subscription = user?.subscription

  return (
    <div className="billing-panel">
      <div className="billing-card">
        <h3 className="billing-card-title">המנוי שלך</h3>
        {subscription ? (
          <div className="billing-status">
            <div className="billing-status-badge active">
              <span className="billing-dot"></span>
              פעיל
            </div>
            <div className="billing-plan-info">
              <span className="billing-plan-name">{subscription.planName || 'מסלול מקצועי'}</span>
              <span className="billing-plan-price">300 ₪ / חודש</span>
            </div>
            {subscription.endsAt && (
              <p className="billing-renewal">חידוש אוטומטי: {new Date(subscription.endsAt).toLocaleDateString('he-IL')}</p>
            )}
          </div>
        ) : (
          <div className="billing-status">
            <div className="billing-status-badge inactive">
              <span className="billing-dot"></span>
              אין מנוי פעיל
            </div>
            <p className="billing-no-plan">לא הוגדר מנוי. הפעל מנוי כדי ליהנות מכל הפיצ'רים.</p>
          </div>
        )}
        <button className="billing-manage-btn" onClick={() => navigate('/subscription')}>
          {subscription ? 'נהל מנוי ותשלום' : 'הפעל מנוי'}
        </button>
      </div>
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
      setWaError(err.userMessage || 'שגיאה בשמירה')
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
      setWaError(err.userMessage || 'שגיאה בשמירה')
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
      setEditError(err.userMessage || 'שגיאה בעדכון')
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
        setPwError(err.userMessage || 'שגיאה')
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
      setPwError(err.userMessage || 'שגיאה בשינוי סיסמה')
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
      {/* ═══ Profile Hero ═══ */}
      <div className="settings-hero">
        <div className="settings-avatar-wrap">
          <div className="settings-avatar">
            {user?.profileImage || user?.avatarUrl
              ? <img src={(() => { const v = user.profileImage || user.avatarUrl; if (v.startsWith('/uploads')) return `http://localhost:8000${v}`; if (v.startsWith('uploads/')) return `http://localhost:8000/${v}`; return v })()} alt="" />
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

      {/* ═══ Sections ═══ */}
      <div className="settings-sections-wrap">

        {/* ─── Basic Info Section ─── */}
        <section className="settings-sect">
          <div className="settings-sect-header">
            <h3 className="settings-sect-title">מידע בסיסי</h3>
            {!editing && (
              <button className="settings-sect-edit" onClick={() => { setEditing(true); setEditName(user?.name || ''); setEditEmail(user?.email || '') }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
              </button>
            )}
          </div>
          <div className="settings-sect-body">
            {editing ? (
              <>
                <div className="settings-fields-grid">
                  <div className="settings-field">
                    <label>שם</label>
                    <input value={editName} onChange={e => setEditName(e.target.value)} placeholder="השם שלך" />
                  </div>
                  <div className="settings-field">
                    <label>אימייל</label>
                    <input value={editEmail} onChange={e => setEditEmail(e.target.value)} placeholder="email@example.com" type="email" dir="ltr" />
                  </div>
                </div>
                {editError && <div className="settings-msg settings-msg-error">{editError}</div>}
                <div className="settings-field-actions">
                  <button className="settings-btn-save" onClick={handleSaveProfile} disabled={saving}>
                    {saving ? '⏳ שומר...' : 'שמור שינויים'}
                  </button>
                  <button className="settings-btn-cancel" onClick={() => setEditing(false)}>ביטול</button>
                </div>
              </>
            ) : (
              <div className="settings-fields-grid">
                <div className="settings-field-display">
                  <span className="settings-field-label">שם פרטי</span>
                  <span className="settings-field-value">{user?.name || '—'}</span>
                </div>
                <div className="settings-field-display">
                  <span className="settings-field-label">אימייל</span>
                  <span className="settings-field-value">{user?.email || '—'}</span>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* ─── Connections Section ─── */}
        <section className="settings-sect">
          <div className="settings-sect-header">
            <h3 className="settings-sect-title">חיבורים</h3>
          </div>
          <div className="settings-sect-body">
            <div className="settings-fields-grid">
              {/* Facebook */}
              <div className="settings-field-display">
                <span className="settings-field-label">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="#1877F2" style={{ verticalAlign: 'middle', marginLeft: 6 }}><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                  פייסבוק
                </span>
                <span className={`settings-field-value ${user?.fbSessionValid ? 'value-ok' : 'value-muted'}`}>
                  {user?.fbSessionValid ? '✓ מחובר' : '✗ לא מחובר'}
                </span>
                <div className="settings-field-inline-actions">
                  {user?.fbSessionValid ? (
                    <>
                      <button className="settings-link-btn" onClick={handleBootstrap} disabled={bootstrapping}>
                        {bootstrapping ? '⏳' : 'החלף'}
                      </button>
                      <button className="settings-link-btn settings-link-btn-danger" onClick={handleDisconnectFB} disabled={disconnecting}>
                        {disconnecting ? '⏳' : 'נתק'}
                      </button>
                    </>
                  ) : (
                    <button className="settings-link-btn settings-link-btn-connect" onClick={handleBootstrap} disabled={bootstrapping}>
                      {bootstrapping ? '⏳ ממתין...' : 'קשר חיבור'}
                    </button>
                  )}
                </div>
              </div>

              {/* WhatsApp */}
              <div className="settings-field-display">
                <span className="settings-field-label">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="#25D366" style={{ verticalAlign: 'middle', marginLeft: 6 }}><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                  וואטסאפ
                </span>
                <span className={`settings-field-value ${user?.whatsappNumber ? 'value-ok' : 'value-muted'}`}>
                  {user?.whatsappNumber ? user.whatsappNumber : '—'}
                </span>
                <div className="settings-field-inline-actions">
                  {user?.whatsappNumber && !waEditing ? (
                    <>
                      <button className="settings-link-btn" onClick={() => { setWaEditing(true); setWaNumber(user.whatsappNumber); setWaMessage(user.whatsappMessage || ''); setWaValidation(null) }}>
                        ערוך
                      </button>
                      <button className="settings-link-btn settings-link-btn-danger" onClick={handleRemoveWhatsapp} disabled={waSaving}>
                        הסר
                      </button>
                    </>
                  ) : !user?.whatsappNumber && !waEditing ? (
                    <button className="settings-link-btn settings-link-btn-connect" onClick={() => setWaEditing(true)}>
                      קשר חיבור
                    </button>
                  ) : null}
                </div>
              </div>
            </div>

            {/* WhatsApp edit form */}
            {waEditing && (
              <div className="settings-inline-form">
                <div className="settings-fields-grid">
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
                  </div>
                </div>
                {waError && <div className="settings-msg settings-msg-error">{waError}</div>}
                <div className="settings-field-actions">
                  <button className="settings-btn-save" onClick={handleSaveWhatsapp} disabled={waSaving || !waNumber.trim()}>
                    {waSaving ? '⏳ שומר...' : 'שמור'}
                  </button>
                  <button className="settings-btn-cancel" onClick={() => { setWaEditing(false); setWaValidation(null) }}>ביטול</button>
                </div>
              </div>
            )}

            {/* WhatsApp message quick-edit */}
            {user?.whatsappNumber && !waEditing && (
              <div className="settings-fields-grid" style={{ marginTop: 4 }}>
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

            {/* Instagram */}
            <div className="settings-fields-grid" style={{ marginTop: 12 }}>
              <div className="settings-field-display">
                <span className="settings-field-label">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="url(#ig-settings-gradient)" style={{ verticalAlign: 'middle', marginLeft: 6 }}>
                    <defs>
                      <linearGradient id="ig-settings-gradient" x1="0%" y1="100%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#FFDC80" />
                        <stop offset="25%" stopColor="#F77737" />
                        <stop offset="50%" stopColor="#E1306C" />
                        <stop offset="75%" stopColor="#C13584" />
                        <stop offset="100%" stopColor="#833AB4" />
                      </linearGradient>
                    </defs>
                    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>
                  </svg>
                  אינסטגרם
                </span>
                <span className={`settings-field-value ${user?.instagramConnected ? 'value-ok' : 'value-muted'}`}>
                  {user?.instagramConnected ? `✓ @${user.instagramUsername}` : '✗ לא מחובר'}
                </span>
                <div className="settings-field-inline-actions">
                  {user?.instagramConnected ? (
                    <button className="settings-link-btn settings-link-btn-danger" onClick={async () => {
                      setConfirmAction({
                        title: 'ניתוק אינסטגרם',
                        message: 'האם אתה בטוח שברצונך לנתק את חיבור האינסטגרם? לא תוכל לפרסם באינסטגרם עד שתתחבר מחדש.',
                        action: async () => {
                          try {
                            await authAPI.disconnectInstagram()
                            setUser(prev => ({ ...prev, instagramConnected: false, instagramUsername: null }))
                          } catch { /* ignore */ }
                        }
                      })
                    }}>
                      נתק
                    </button>
                  ) : (
                    <button className="settings-link-btn settings-link-btn-connect" onClick={async () => {
                      try {
                        const res = await authAPI.getInstagramAuthUrl()
                        if (res.data.authUrl) {
                          const popup = window.open(res.data.authUrl, 'instagram-oauth', 'width=600,height=700,left=200,top=100')
                          console.log('[IG-Connect] Popup opened:', !!popup)
                          const handleMessage = (event) => {
                            console.log('[IG-Connect] postMessage received:', event.data)
                            if (!event.data || event.data.type !== 'instagram-oauth-callback') return
                            window.removeEventListener('message', handleMessage)
                            if (event.data.success) {
                              console.log('[IG-Connect] SUCCESS via postMessage, username:', event.data.username)
                              setUser(prev => ({ ...prev, instagramConnected: true, instagramUsername: event.data.username }))
                            }
                          }
                          window.addEventListener('message', handleMessage)
                          // Poll until popup closes, then check server status
                          const timer = setInterval(async () => {
                            if (popup?.closed) {
                              clearInterval(timer)
                              window.removeEventListener('message', handleMessage)
                              console.log('[IG-Connect] Popup closed, checking status...')
                              try {
                                const statusRes = await authAPI.getInstagramStatus()
                                console.log('[IG-Connect] Status response:', statusRes?.data)
                                if (statusRes?.data?.connected) {
                                  setUser(prev => ({ ...prev, instagramConnected: true, instagramUsername: statusRes.data.account?.username }))
                                  console.log('[IG-Connect] User state updated!')
                                }
                              } catch (err) { console.error('[IG-Connect] Status check FAILED:', err.message, err.response?.status, err.response?.data) }
                            }
                          }, 500)
                        }
                      } catch (err) {
                        console.error('[IG-Connect] Auth URL FAILED:', err)
                        window.alert('שגיאה ביצירת קישור חיבור')
                      }
                    }}>
                      חבר חשבון
                    </button>
                  )}
                </div>
              </div>
            </div>

            {!user?.instagramConnected && (
              <div className="settings-ig-notice">
                <span className="settings-ig-notice-icon">⚠️</span>
                <span>חיבור אינסטגרם דורש חשבון מסוג <strong>Business</strong> או <strong>Creator</strong>. חשבון אישי רגיל לא נתמך.</span>
              </div>
            )}
          </div>
        </section>

        {/* ─── Security Section ─── */}
        <section className="settings-sect">
          <div className="settings-sect-header">
            <h3 className="settings-sect-title">אבטחה</h3>
          </div>
          <div className="settings-sect-body">
            {!showPassword ? (
              <div className="settings-fields-grid">
                <div className="settings-field-display">
                  <span className="settings-field-label">סיסמה</span>
                  <span className="settings-field-value value-muted">••••••••</span>
                  <div className="settings-field-inline-actions">
                    <button className="settings-link-btn" onClick={() => setShowPassword(true)}>שנה סיסמה</button>
                  </div>
                </div>
              </div>
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
                    <div className="settings-msg settings-msg-success" style={{ marginBottom: 8 }}>
                      📧 קוד אימות נשלח ל-{user?.email}
                    </div>
                    <div className="settings-field">
                      <label>קוד אימות</label>
                      <OtpInput length={6} value={pwCode} onChange={setPwCode} />
                    </div>
                    <div className="settings-fields-grid">
                      <div className="settings-field">
                        <label>סיסמה חדשה</label>
                        <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="לפחות 6 תווים" dir="ltr" />
                      </div>
                      <div className="settings-field">
                        <label>אימות סיסמה חדשה</label>
                        <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="הזן שוב" dir="ltr" />
                      </div>
                    </div>
                  </>
                )}
                {pwError && <div className="settings-msg settings-msg-error">{pwError}</div>}
                {pwSuccess && <div className="settings-msg settings-msg-success">✓ הסיסמה שונתה בהצלחה!</div>}
                <div className="settings-field-actions">
                  <button className="settings-btn-save" onClick={handleChangePassword} disabled={pwSaving || (pwStep === 1 ? !currentPassword : (!pwCode || !newPassword))}>
                    {pwSaving ? '⏳' : pwStep === 1 ? 'שלח קוד אימות' : 'שנה סיסמה'}
                  </button>
                  <button className="settings-btn-cancel" onClick={() => { setShowPassword(false); setPwError(null); setPwStep(1); setCurrentPassword(''); setNewPassword(''); setConfirmPassword(''); setPwCode('') }}>ביטול</button>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* ─── Appearance Section ─── */}
        <section className="settings-sect">
          <div className="settings-sect-header">
            <h3 className="settings-sect-title">מראה</h3>
          </div>
          <div className="settings-sect-body">
            <div className="settings-fields-grid">
              <div className="settings-field-display">
                <span className="settings-field-label">ערכת נושא</span>
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
          </div>
        </section>

        {/* ─── Danger Zone ─── */}
        <section className="settings-sect settings-sect-danger">
          <div className="settings-sect-body">
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
  const [showAllGroups, setShowAllGroups] = useState(false)
  const [whatsappNumber, setWhatsappNumber] = useState(campaign.whatsappNumber || '')
  const [whatsappMessage, setWhatsappMessage] = useState(campaign.whatsappMessage || '')
  const [showWhatsapp, setShowWhatsapp] = useState(!!(campaign.whatsappNumber))
  const existingEditImgs = (campaign.images?.length ? campaign.images : (campaign.imageUrl ? [campaign.imageUrl] : []))
    .map(url => url?.startsWith('/uploads') ? `http://localhost:8000${url}` : url)
  const [imagePreviews, setImagePreviews] = useState(existingEditImgs)

  const selectedGroupObjects = groups.filter(g => selectedGroups.includes(g.id))
  const visibleSelected = showAllGroups ? selectedGroupObjects : selectedGroupObjects.slice(0, 4)

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
      whatsappNumber: showWhatsapp ? whatsappNumber.trim() || null : null,
      whatsappMessage: showWhatsapp ? whatsappMessage.trim() || null : null,
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
            <label>קבוצות ({selectedGroups.length})</label>
            {selectedGroups.length > 0 && (
              <div className="selected-groups-chips">
                {visibleSelected.map(g => (
                  <span key={g.id} className="selected-group-chip">
                    {g.name}
                    <button type="button" onClick={() => toggleGroup(g.id)}>✕</button>
                  </span>
                ))}
                {selectedGroupObjects.length > 4 && (
                  <button type="button" className="groups-expand-btn" onClick={() => setShowAllGroups(!showAllGroups)}>
                    {showAllGroups ? 'הצג פחות' : `+${selectedGroupObjects.length - 4} נוספות`}
                  </button>
                )}
              </div>
            )}
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
            <div className="wa-toggle-row">
              <label>WhatsApp</label>
              <button
                type="button"
                className={`wa-toggle-btn ${showWhatsapp ? 'active' : ''}`}
                onClick={() => setShowWhatsapp(!showWhatsapp)}
              >
                {showWhatsapp ? <><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{marginLeft: 4}}><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg> מופעל</> : <><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{marginLeft: 4}}><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg> כבוי</>}
              </button>
            </div>
            {showWhatsapp && (
              <>
                <input type="text" value={whatsappNumber} onChange={e => setWhatsappNumber(e.target.value)} placeholder="מספר וואטסאפ" />
                <input type="text" value={whatsappMessage} onChange={e => setWhatsappMessage(e.target.value)} placeholder="הודעה מוכנה (אופציונלי)" style={{ marginTop: '8px' }} />
              </>
            )}
          </div>

          <div className="detail-edit-actions">
            <button type="submit" className="modal-submit-btn" disabled={loading || !text || !selectedGroups.length}>
              {loading ? '⏳ מעדכן...' : 'עדכן קמפיין'}
            </button>
            <button type="button" className="modal-cancel-btn" onClick={onClose}>ביטול</button>
          </div>
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
    .map(url => url?.startsWith('/uploads') ? `http://localhost:8000${url}` : url)
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

const API_HOST = 'http://localhost:8000'

function CampaignDetailModal({ campaign, onClose, onEdit, onPause, onDuplicate, onDelete, groups, loading, onSave, initialEditing }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [editing, setEditing] = useState(!!initialEditing)
  const [lightboxIdx, setLightboxIdx] = useState(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [pubHistory, setPubHistory] = useState(null)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [refreshingId, setRefreshingId] = useState(null)
  const menuRef = useRef(null)

  // Load publication history lazily (on button click only)

  const images = campaign.images?.length ? campaign.images : (campaign.imageUrl ? [campaign.imageUrl] : [])
  const imgSrc = (url) => url?.startsWith('/uploads') ? `${API_HOST}${url}` : url

  const STATUS_LABELS = {
    scheduled: 'מתוזמן', paused: 'מושהה', draft: 'טיוטה',
    recurring: 'חוזר', active: 'פעיל', published: 'פורסם',
  }
  const DAY_NAMES = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳']

  const loadHistory = async () => {
    if (pubHistory) { setHistoryOpen(!historyOpen); return }
    setHistoryLoading(true)
    try {
      const res = await groupsService.getCampaign(campaign.id)
      setPubHistory(res.data.campaign.publicationHistory || [])
      setHistoryOpen(true)
    } catch { /* ignore */ }
    setHistoryLoading(false)
  }

  const handleRefreshMetrics = async (pubId) => {
    setRefreshingId(pubId)
    window.dispatchEvent(new CustomEvent('postit-op-start', { detail: { id: `refresh-${pubId}`, msg: 'מרענן מידע עבור פוסט זה...' } }))
    try {
      const res = await groupsService.refreshPublicationMetrics(pubId)
      if (res.data.success) {
        setPubHistory(prev => prev?.map(h => (h.id === pubId || h.originalId === pubId) ? { ...h, likes: res.data.metrics.likes, comments: res.data.metrics.comments } : h))
        window.dispatchEvent(new CustomEvent('postit-op-done', { detail: { id: `refresh-${pubId}`, success: true, msg: `✅ מידע עודכן: ${res.data.metrics.likes} לייקים, ${res.data.metrics.comments} תגובות` } }))
      }
    } catch {
      window.dispatchEvent(new CustomEvent('postit-op-done', { detail: { id: `refresh-${pubId}`, success: false, msg: '⚠️ שגיאה ברענון מידע' } }))
    }
    setRefreshingId(null)
  }

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
  const [showAllGroups, setShowAllGroups] = useState(false)
  const [whatsappNumber, setWhatsappNumber] = useState(campaign.whatsappNumber || '')
  const [whatsappMessage, setWhatsappMessage] = useState(campaign.whatsappMessage || '')
  const [showWhatsapp, setShowWhatsapp] = useState(!!(campaign.whatsappNumber))
  const existingDetailImgs = (campaign.images?.length ? campaign.images : (campaign.imageUrl ? [campaign.imageUrl] : []))
    .map(url => url?.startsWith('/uploads') ? `http://localhost:8000${url}` : url)
  const [imagePreviews, setImagePreviews] = useState(existingDetailImgs)

  const selectedGroupObjects = groups.filter(g => selectedGroups.includes(g.id))
  const visibleSelected = showAllGroups ? selectedGroupObjects : selectedGroupObjects.slice(0, 4)

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
      whatsappNumber: showWhatsapp ? whatsappNumber.trim() || null : null,
      whatsappMessage: showWhatsapp ? whatsappMessage.trim() || null : null,
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

        {/* Per-type IG media */}
        {!editing && campaign.igTypeMedia && (campaign.igTypeMedia.FEED?.length > 0 || campaign.igTypeMedia.STORY?.length > 0 || campaign.igTypeMedia.REEL?.length > 0) && (
          <div className="detail-ig-type-media">
            <h4 className="detail-ig-type-media-title">📌 מדיה ספציפית לפי סוג:</h4>
            {campaign.igTypeMedia.FEED?.length > 0 && (
              <div className="detail-ig-type-media-section">
                <span className="detail-ig-type-label">🖼️ פיד:</span>
                <div className="detail-ig-type-media-thumbs">
                  {campaign.igTypeMedia.FEED.map((m, i) => (
                    m.mediaType === 'VIDEO'
                      ? <video key={i} src={imgSrc(m.url)} className="detail-ig-type-thumb" />
                      : <img key={i} src={imgSrc(m.url)} alt="" className="detail-ig-type-thumb" />
                  ))}
                </div>
              </div>
            )}
            {campaign.igTypeMedia.STORY?.length > 0 && (
              <div className="detail-ig-type-media-section">
                <span className="detail-ig-type-label">📸 סטורי:</span>
                <div className="detail-ig-type-media-thumbs">
                  {campaign.igTypeMedia.STORY.map((m, i) => (
                    m.mediaType === 'VIDEO'
                      ? <video key={i} src={imgSrc(m.url)} className="detail-ig-type-thumb" />
                      : <img key={i} src={imgSrc(m.url)} alt="" className="detail-ig-type-thumb" />
                  ))}
                </div>
              </div>
            )}
            {campaign.igTypeMedia.REEL?.length > 0 && (
              <div className="detail-ig-type-media-section">
                <span className="detail-ig-type-label">🎬 ריל:</span>
                <div className="detail-ig-type-media-thumbs">
                  {campaign.igTypeMedia.REEL.map((m, i) => (
                    <video key={i} src={imgSrc(m.url)} className="detail-ig-type-thumb" />
                  ))}
                </div>
              </div>
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
              <label>קבוצות ({selectedGroups.length})</label>
              {selectedGroups.length > 0 && (
                <div className="selected-groups-chips">
                  {visibleSelected.map(g => (
                    <span key={g.id} className="selected-group-chip">
                      {g.name}
                      <button type="button" onClick={() => toggleGroup(g.id)}>✕</button>
                    </span>
                  ))}
                  {selectedGroupObjects.length > 4 && (
                    <button type="button" className="groups-expand-btn" onClick={() => setShowAllGroups(!showAllGroups)}>
                      {showAllGroups ? 'הצג פחות' : `+${selectedGroupObjects.length - 4} נוספות`}
                    </button>
                  )}
                </div>
              )}
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
            <div className="form-group">
              <div className="wa-toggle-row">
                <label>WhatsApp</label>
                <button
                  type="button"
                  className={`wa-toggle-btn ${showWhatsapp ? 'active' : ''}`}
                  onClick={() => setShowWhatsapp(!showWhatsapp)}
                >
                  {showWhatsapp ? <><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{marginLeft: 4}}><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg> מופעל</> : <><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{marginLeft: 4}}><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg> כבוי</>}
                </button>
              </div>
              {showWhatsapp && (
                <>
                  <input type="text" value={whatsappNumber} onChange={e => setWhatsappNumber(e.target.value)} placeholder="מספר וואטסאפ" />
                  <input type="text" value={whatsappMessage} onChange={e => setWhatsappMessage(e.target.value)} placeholder="הודעה מוכנה (אופציונלי)" style={{ marginTop: '8px' }} />
                </>
              )}
            </div>
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
                <span className="detail-label">פלטפורמות</span>
                <span className="detail-platforms-list">
                  {(campaign.groupCount > 0) && <span className="detail-platform-chip">קבוצות פייסבוק</span>}
                  {campaign.publishToProfile && <span className="detail-platform-chip">פרופיל אישי</span>}
                  {campaign.instagramEnabled && campaign.instagramPublishType?.includes('FEED') && <span className="detail-platform-chip">אינסטגרם פוסט</span>}
                  {campaign.instagramEnabled && campaign.instagramPublishType?.includes('STORY') && <span className="detail-platform-chip">אינסטגרם סטורי</span>}
                  {campaign.instagramEnabled && campaign.instagramPublishType?.includes('REEL') && <span className="detail-platform-chip">אינסטגרם רילס</span>}
                  {campaign.instagramEnabled && !campaign.instagramPublishType && <span className="detail-platform-chip">אינסטגרם</span>}
                </span>
              </div>
              {(campaign.groupCount > 0 || campaign.groupNames?.length > 0) && (
                <div className="detail-meta-item">
                  <span className="detail-label">קבוצות פייסבוק</span>
                  <span>👥 {campaign.groupCount || campaign.groupNames?.length || 0} {campaign.groupNames?.join(', ') || ''}</span>
                </div>
              )}
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
              {campaign.postUrl && (
                <div className="detail-meta-item">
                  <span className="detail-label">קישור לפוסט</span>
                  <a href={campaign.postUrl} target="_blank" rel="noopener noreferrer" className="detail-link">🔗 צפה בפוסט {campaign.postUrl.includes('instagram.com') ? 'באינסטגרם' : 'בפייסבוק'}</a>
                </div>
              )}

              {/* Publication History */}
              {(campaign.publishedCount > 0 || campaign.status === 'published') && (
                <div className="detail-history-section">
                  <button className="detail-history-btn" onClick={loadHistory} disabled={historyLoading}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                    </svg>
                    {historyLoading ? 'טוען...' : historyOpen ? 'הסתר היסטוריית פרסומים' : 'היסטוריית פרסומים'}
                    {!historyOpen && <span className="detail-history-count">{campaign.publishedCount || ''}</span>}
                  </button>
                  {historyOpen && pubHistory && (
                    <div className="detail-history-list">
                      {pubHistory.length === 0 ? (
                        <p className="detail-history-empty">אין היסטוריית פרסומים</p>
                      ) : pubHistory.map(h => (
                        <div key={h.id} className="detail-history-card">
                          <div className="detail-history-card-top">
                            <div className="detail-history-group">
                              {h.groupImage
                                ? <img src={h.groupImage} alt="" className="detail-history-avatar" onError={e => { e.target.style.display='none'; e.target.nextSibling.style.display='flex' }} />
                                : null}
                              <span className="detail-history-avatar-fallback" style={h.groupImage ? { display: 'none' } : {}}>{h.groupName?.[0] || '?'}</span>
                              <div className="detail-history-group-info">
                                <span className="detail-history-name">{h.groupName}</span>
                                <span className="detail-history-date">
                                  {new Date(h.publishedAt).toLocaleDateString('he-IL', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                </span>
                              </div>
                            </div>
                            <span className={`detail-history-status ${h.status === 'SUCCESS' ? 'status-success' : 'status-fail'}`}>
                              {h.status === 'SUCCESS' ? '✓ פורסם' : '✗ נכשל'}
                            </span>
                          </div>
                          <div className="detail-history-card-stats">
                            {h.igPublishType !== 'STORY' && (
                              <>
                                <span className="detail-history-stat" title="לייקים">
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3H14z"/><path d="M7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3"/></svg>
                                  {h.likes ?? '—'}
                                </span>
                                <span className="detail-history-stat" title="תגובות">
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
                                  {h.comments ?? '—'}
                                </span>
                              </>
                            )}
                            {h.postUrl && h.igPublishType !== 'STORY' && (
                              <a href={h.postUrl} target="_blank" rel="noopener noreferrer" className="detail-history-stat detail-history-link" title={h.platform === 'INSTAGRAM' ? 'פתח באינסטגרם' : 'פתח בפייסבוק'}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                                {h.platform === 'INSTAGRAM' ? 'צפה באינסטגרם' : 'צפה בפוסט'}
                              </a>
                            )}
                            {h.status === 'SUCCESS' && h.igPublishType !== 'STORY' && (
                              <button
                                className={`detail-history-stat detail-history-refresh ${refreshingId === (h.originalId || h.id) ? 'refreshing' : ''}`}
                                title="רענן לייקים ותגובות"
                                disabled={!!refreshingId}
                                onClick={() => handleRefreshMetrics(h.originalId || h.id)}
                              >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
                                  <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
                                </svg>
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
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
