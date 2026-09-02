import { useState, useEffect, useMemo, useRef, useCallback, Fragment } from 'react'
import { useNavigate, Link, useLocation, useSearchParams } from 'react-router-dom'
import { useAppData } from '../context/DataProvider'
import { useTheme } from '../context/ThemeProvider'
import { groupsService } from '../services/groupsService'
import { authAPI } from '../services/api'
import { logClientError, logClientWarning } from '../services/clientLogger'
import ConfirmDialog from '../components/ConfirmDialog'
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip } from 'recharts'
import DashboardOverview from '../components/DashboardOverview'
import BrandLogo from '../components/BrandLogo'

const API_HOST = import.meta.env.VITE_API_ORIGIN || ''
const IMAGE_EXTENSION_RE = /\.(avif|bmp|gif|jpe?g|png|svg|webp)(\?.*)?$/i

function isRenderableImageUrl(value) {
  if (typeof value !== 'string') return false
  const url = value.trim()
  if (!url) return false
  if (url.startsWith('/uploads') || url.startsWith('uploads/')) return true
  if (url.startsWith('blob:') || url.startsWith('data:image/')) return true
  if (/^(https?:\/\/)?(wa\.me|api\.whatsapp\.com|web\.whatsapp\.com)\b/i.test(url)) return false
  return IMAGE_EXTENSION_RE.test(url)
}

function getRenderableImages(values) {
  return (Array.isArray(values) ? values : []).filter(isRenderableImageUrl)
}

function getCampaignImages(campaign) {
  const images = getRenderableImages(campaign?.images)
  if (images.length) return images
  return getRenderableImages(campaign?.imageUrl ? [campaign.imageUrl] : [])
}

function resolveImg(url) {
  if (!url) return ''
  if (url.startsWith('/uploads')) return `${API_HOST}${url}`
  if (url.startsWith('uploads/')) return `${API_HOST}/${url}`
  return url
}

const FacebookLogo = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#fff" d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.098 4.388 23.093 10.125 24v-8.385H7.078v-3.542h3.047V9.37c0-3.02 1.792-4.688 4.533-4.688 1.312 0 2.686.236 2.686.236v2.965H15.83c-1.491 0-1.956.93-1.956 1.884v2.306h3.328l-.532 3.542h-2.796V24C19.612 23.093 24 18.098 24 12.073Z"/></svg>
)

const InstagramLogo = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#fff" d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919C8.417 2.175 8.796 2.163 12 2.163ZM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24s3.668-.014 4.948-.072c4.354-.2 6.782-2.618 6.979-6.98C23.986 15.668 24 15.259 24 12s-.014-3.667-.072-4.947C23.732 2.699 21.311.273 16.949.073 15.668.014 15.259 0 12 0Zm0 5.838A6.162 6.162 0 1 0 12 18.162 6.162 6.162 0 0 0 12 5.838ZM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8Zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881Z"/></svg>
)

const WhatsAppLogo = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#fff" d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-2.096-1.046-3.47-3.165-3.574-3.31-.173-.297-.018-.458.13-.606.371-.369.554-.654.744-1.052.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-1.77-.077-2.58 1.344-2.58 2.762 0 2.558 2.15 5.032 2.448 5.43 2.108 2.795 5.23 4.635 8.435 4.635 2.022 0 3.494-1.027 3.99-2.441.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347ZM12.05 21.785a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 5.45 0 9.886 4.438 9.883 9.892-.003 5.45-4.437 9.884-9.891 9.884ZM12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654A11.882 11.882 0 0 0 12.045 23.794c6.554 0 11.89-5.335 11.893-11.893C23.94 5.346 18.606 0 12.05 0Z"/></svg>
)

function formatMetricsTimestamp(lastSyncedAt, publishedAt) {
  const value = lastSyncedAt || publishedAt
  if (!value) return 'טרם סונכרן'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'טרם סונכרן'
  if (!lastSyncedAt) {
    return `טרם סונכרן · פורסם ב־${date.toLocaleString('he-IL', {
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
    })}`
  }
  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000))
  if (seconds < 60) return 'סונכרן לאחרונה עכשיו'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `סונכרן לאחרונה לפני ${minutes} דקות`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `סונכרן לאחרונה לפני ${hours} שעות`
  const days = Math.floor(hours / 24)
  if (days < 7) return `סונכרן לאחרונה לפני ${days} ימים`
  return `סונכרן לאחרונה ב־${date.toLocaleString('he-IL', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })}`
}

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
  { id: 'groups', icon: '👥', label: 'קבוצות' },
  { id: 'posts', icon: '📝', label: 'פרסומים' },
  { id: 'stats', icon: '📊', label: 'סטטיסטיקה' },
  { id: 'account', icon: '👤', label: 'ניהול חשבון' },
]

export default function Dashboard() {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const {
    user, setUser, authChecked, logout, ensureFresh, forceRefresh,
    campaigns, groups, jobs, posts, stats, dataReady,
    setStats, updateGroups, updateCampaignEverywhere, refreshing,
  } = useAppData()

  const activeTab = searchParams.get('tab') || 'overview'
  const setActiveTab = useCallback((tab) => {
    setSearchParams({ tab }, { replace: true })
  }, [setSearchParams])

  // Respond to global pull-to-refresh from AuthLayout
  useEffect(() => {
    const handler = async () => {
      await forceRefresh()
      window.dispatchEvent(new Event('possbo-pull-refresh-done'))
    }
    window.addEventListener('possbo-pull-refresh', handler)
    return () => window.removeEventListener('possbo-pull-refresh', handler)
  }, [forceRefresh])

  // Sync subTab from URL (e.g. navigating from Overview KPIs)
  useEffect(() => {
    const sub = searchParams.get('subTab')
    if (sub && (sub === 'all' || sub === 'scheduled' || sub === 'published')) {
      setCampaignSubTab(sub)
    }
  }, [searchParams])
  const [search, setSearch] = useState('')
  const [viewMode, setViewMode] = useState('list') // 'grid' | 'list'
  const [campaignSubTab, setCampaignSubTab] = useState(() => searchParams.get('subTab') || 'all') // 'all' | 'scheduled' | 'published'

  // Filters
  const [statusFilter, setStatusFilter] = useState('all')
  const [platformFilter, setPlatformFilter] = useState('all') // 'all' | 'facebook' | 'instagram' | 'both'
  const [groupFilter, setGroupFilter] = useState('all')
  const [groupFilterOpen, setGroupFilterOpen] = useState(false)
  const [groupFilterSearch, setGroupFilterSearch] = useState('')
  const [templateFilter, setTemplateFilter] = useState('all')
  const [templateFilterOpen, setTemplateFilterOpen] = useState(false)
  const [templateFilterSearch, setTemplateFilterSearch] = useState('')
  const [sortBy, setSortBy] = useState('date')

  const [dateFrom] = useState('')
  const [dateTo] = useState('')
  const [refreshingGroups, setRefreshingGroups] = useState(false)
  const [filterSheetOpen, setFilterSheetOpen] = useState(false)
  const [sheetGroupExpand, setSheetGroupExpand] = useState(false)
  const [sheetTemplateExpand, setSheetTemplateExpand] = useState(false)
  const [sheetGroupSearch, setSheetGroupSearch] = useState('')
  const [sheetTemplateSearch, setSheetTemplateSearch] = useState('')
  const [bootstrapping, setBootstrapping] = useState(false)
  const [showConnectionsModal, setShowConnectionsModal] = useState(false)
  const [connectingPlatform, setConnectingPlatform] = useState(null)
  const [quickWhatsappQr, setQuickWhatsappQr] = useState(null)
  const quickWhatsappPollRef = useRef(null)
  const [facebookLiveUrl, setFacebookLiveUrl] = useState(null)
  const facebookConnectPollRef = useRef(null)
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

  const loadStats = useCallback(async () => {
    try {
      const params = {}
      if (dateFrom) params.from = dateFrom
      if (dateTo) params.to = dateTo
      const res = await groupsService.getStats(params)
      if (res.data.stats) setStats(res.data.stats)
    } catch { /* ignore */ }
  }, [dateFrom, dateTo, setStats])

  useEffect(() => {
    if (activeTab === 'stats' && (dateFrom || dateTo)) {
      loadStats()
    }
  }, [activeTab, dateFrom, dateTo, loadStats])

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

  const connectFacebook = async () => {
    setShowConnectionsModal(false)
    setConnectingPlatform('facebook')
    const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms))

    const startRemoteWithRetry = async (maxAttempts = 4) => {
      let lastError
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
          return await groupsService.startRemoteFacebookSession()
        } catch (error) {
          lastError = error
          const reason = error.response?.data?.error || error.message
          if (reason !== 'facebook_operation_in_progress' || attempt === maxAttempts) {
            throw error
          }
          await wait(1500)
        }
      }
      throw lastError || new Error('connection_failed')
    }

    try {
      if (facebookConnectPollRef.current) clearInterval(facebookConnectPollRef.current)
      const response = await startRemoteWithRetry()
      const initialStatus = response.data?.status
      if (response.data?.liveUrl) {
        setFacebookLiveUrl(response.data.liveUrl)
      } else if (!['starting', 'waiting', 'connected'].includes(initialStatus)) {
        throw new Error(response.data?.error || 'connection_failed')
      }
      facebookConnectPollRef.current = setInterval(async () => {
        try {
          const status = await groupsService.getRemoteFacebookSessionStatus()
          if (status.data?.status === 'waiting' && status.data?.liveUrl) {
            setFacebookLiveUrl(status.data.liveUrl)
          } else if (status.data?.status === 'connected') {
            clearInterval(facebookConnectPollRef.current)
            facebookConnectPollRef.current = null
            setFacebookLiveUrl(null)
            setConnectingPlatform(null)
            setUser(prev => ({ ...prev, fbSessionValid: true }))
          } else if (['expired', 'error', 'cancelled'].includes(status.data?.status)) {
            clearInterval(facebookConnectPollRef.current)
            facebookConnectPollRef.current = null
            setFacebookLiveUrl(null)
            setConnectingPlatform(null)
            window.alert('חיבור Facebook לא הושלם. אפשר לנסות שוב ולהשלים גם אימות דו־שלבי אם Facebook מבקש.')
          }
        } catch { /* keep polling while the remote browser is visible */ }
      }, 2000)
    } catch (err) {
      logClientError('quick_facebook_connect_failed', err, { source: 'Dashboard' })
      setConnectingPlatform(null)
      const reason = err.response?.data?.error || err.message
      window.alert(reason === 'not_configured'
        ? 'שירות החיבור המאובטח ל-Facebook עדיין לא הוגדר בשרת.'
        : reason === 'facebook_operation_in_progress'
          ? 'יש כרגע פעולה אחרת שמשתמשת בחיבור Facebook. נסו שוב בעוד כמה שניות.'
        : 'לא ניתן לפתוח כרגע את חיבור Facebook. נסו שוב בעוד רגע.')
    }
  }

  const connectInstagram = async () => {
    setConnectingPlatform('instagram')
    // Open synchronously from the click event with a server-side redirect to
    // avoid an extra client API roundtrip before the popup navigates.
    const popup = window.open('/api/instagram/auth-start', 'instagram-oauth', 'width=600,height=700,left=200,top=100')
    if (!popup) {
      setConnectingPlatform(null)
      window.alert('הדפדפן חסם את חלון החיבור. יש לאפשר חלונות קופצים ולנסות שוב.')
      return
    }

    let completed = false
    const popupClosedWatcher = setInterval(() => {
      if (!popup.closed || completed) return
      clearInterval(popupClosedWatcher)
      setConnectingPlatform(null)
    }, 700)

    const finalize = () => {
      completed = true
      clearInterval(popupClosedWatcher)
      window.removeEventListener('message', handleMessage)
    }

    const mapInstagramError = (errorCode) => {
      if (!errorCode) return 'חיבור Instagram בוטל או נכשל. נסו שוב.'
      if (errorCode === 'not_configured') return 'שירות Instagram עדיין לא הוגדר בשרת.'
      if (errorCode === 'access_denied') return 'ההרשאה ל-Instagram נדחתה. נסו שוב ואשרו את כל ההרשאות.'
      if (errorCode === 'server_error' || errorCode === 'auth_start_failed') return 'אירעה שגיאת שרת בחיבור Instagram. נסו שוב בעוד רגע.'
      return `חיבור Instagram נכשל: ${errorCode}`
    }

    const handleMessage = (event) => {
      if (event.origin !== window.location.origin) return
      if (event.data?.type !== 'instagram-oauth-callback') return

      finalize()
      setConnectingPlatform(null)

      if (event.data.success) {
        setUser(prev => ({ ...prev, instagramConnected: true, instagramUsername: event.data.username }))
        return
      }

      window.alert(mapInstagramError(event.data.error))
    }

    window.addEventListener('message', handleMessage)
  }

  const connectWhatsapp = async () => {
    setConnectingPlatform('whatsapp')
    try {
      const res = await authAPI.connectWhatsapp()
      if (!res.data?.qrDataUrl) throw new Error('Missing WhatsApp QR')
      setShowConnectionsModal(false)
      setQuickWhatsappQr(res.data.qrDataUrl)
      if (quickWhatsappPollRef.current) clearInterval(quickWhatsappPollRef.current)
      quickWhatsappPollRef.current = setInterval(async () => {
        try {
          const status = await authAPI.getWhatsappStatus()
          if (status.data?.connected) {
            clearInterval(quickWhatsappPollRef.current)
            quickWhatsappPollRef.current = null
            setQuickWhatsappQr(null)
            setConnectingPlatform(null)
            setUser(prev => ({ ...prev, whatsappSessionConnected: true, whatsappSessionPhone: status.data.phone || null }))
          } else if (status.data?.qrDataUrl) {
            setQuickWhatsappQr(status.data.qrDataUrl)
          }
        } catch { /* keep polling while the QR is visible */ }
      }, 3000)
    } catch (err) {
      setConnectingPlatform(null)
      logClientError('quick_whatsapp_connect_failed', err, { source: 'Dashboard' })
      window.alert('לא ניתן לפתוח את חיבור WhatsApp')
    }
  }

  useEffect(() => () => {
    if (quickWhatsappPollRef.current) clearInterval(quickWhatsappPollRef.current)
    if (facebookConnectPollRef.current) clearInterval(facebookConnectPollRef.current)
  }, [])

  const connections = [
    { id: 'facebook', name: 'Facebook', connected: Boolean(user?.fbSessionValid), icon: <FacebookLogo />, action: connectFacebook },
    { id: 'instagram', name: 'Instagram', connected: Boolean(user?.instagramConnected), icon: <InstagramLogo />, action: connectInstagram },
    { id: 'whatsapp', name: 'WhatsApp', connected: Boolean(user?.whatsappSessionConnected), icon: <WhatsAppLogo />, action: connectWhatsapp },
  ]
  const missingConnections = connections.filter(connection => !connection.connected)

  useEffect(() => {
    if (!dataReady || refreshing || missingConnections.length < 2) return
    const key = `possbo-connections-prompt-${user?.id || 'user'}`
    if (sessionStorage.getItem(key)) return
    sessionStorage.setItem(key, '1')
    setShowConnectionsModal(true)
  }, [dataReady, refreshing, missingConnections.length, user?.id])

  const handleRefreshGroups = async () => {
    setRefreshingGroups(true)
    setSessionRequired(false)
    window.dispatchEvent(new CustomEvent('possbo-sync-start', { detail: { msg: 'מסנכרן קבוצות מפייסבוק... אפשר להמשיך לגלוש באתר' } }))
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
        window.dispatchEvent(new CustomEvent('possbo-sync-done', { detail: { success: true, msg: `✅ סונכרנו ${res.data.groups.length} קבוצות בהצלחה! מעדכן מטא-דאטה ברקע...` } }))
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
                  if (savedRes.data?.groups) {
                    updateGroups(savedRes.data.groups)
                    window.dispatchEvent(new CustomEvent('possbo-sync-done', {
                      detail: { success: true, metadataUpdated: true }
                    }))
                  }
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
        window.dispatchEvent(new CustomEvent('possbo-sync-done', { detail: { success: false, msg: '⚠️ חיבור הפייסבוק פג תוקף, יש להתחבר מחדש' } }))
      } else {
        window.dispatchEvent(new CustomEvent('possbo-sync-done', { detail: { success: false, msg: '⚠️ שגיאה בסנכרון הקבוצות' } }))
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
  }, [activeTab, searchParams])

  const hasActiveFilters = statusFilter !== 'all' || platformFilter !== 'all' || groupFilter !== 'all' || templateFilter !== 'all' || sortBy !== 'date' || Boolean(dashDateRange.from)

  const resetFilters = () => {
    setStatusFilter('all')
    setPlatformFilter('all')
    setGroupFilter('all')
    setTemplateFilter('all')
    setSortBy(activeTab === 'groups' ? 'name' : 'date')
    setDashDateRange({ from: '', to: '' })
  }

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
        list = list.filter(c => (c.groupCount > 0 || c.publishToProfile) && !c.instagramEnabled && !c.whatsappEnabled)
      } else if (platformFilter === 'instagram') {
        list = list.filter(c => c.instagramEnabled && c.groupCount === 0 && !c.publishToProfile && !c.whatsappEnabled)
      } else if (platformFilter === 'whatsapp') {
        list = list.filter(c => c.whatsappEnabled && c.groupCount === 0 && !c.publishToProfile && !c.instagramEnabled)
      } else if (platformFilter === 'both') {
        list = list.filter(c => (c.instagramEnabled && (c.groupCount > 0 || c.publishToProfile)) || (c.whatsappEnabled && (c.groupCount > 0 || c.publishToProfile || c.instagramEnabled)))
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
      <div className="dash-main">
        {/* Content */}
        <div className="dash-body">
          {!authChecked ? (
            <div className="dash-loader">
              <BrandLogo decorative className="loader-logo-pulse" />
            </div>
          ) : !dataReady ? (
            <div className="dash-loader">
              <BrandLogo decorative className="loader-logo-pulse" />
            </div>
          ) : (
            <>
              {/* Connection banner — a direct action for one missing account, a hub for several */}
              {user && missingConnections.length > 0 && dataReady && !refreshing && (
                <div className="session-banner">
                  <span>
                    ⚠️ {missingConnections.length === 1
                      ? `חשבון ${missingConnections[0].name} לא מחובר, פרסומים לערוץ זה לא יישלחו`
                      : `${missingConnections.length} חשבונות עדיין לא מחוברים. חברו אותם כדי לפרסם בכל הערוצים`}
                  </span>
                  <button
                    className="session-banner-btn"
                    disabled={missingConnections.length === 1 && (
                      connectingPlatform === missingConnections[0].id ||
                      (missingConnections[0].id === 'facebook' && bootstrapping)
                    )}
                    onClick={() => {
                      if (missingConnections.length === 1) missingConnections[0].action()
                      else setShowConnectionsModal(true)
                    }}
                  >
                    {missingConnections.length === 1 && (
                      connectingPlatform === missingConnections[0].id ||
                      (missingConnections[0].id === 'facebook' && bootstrapping)
                    )
                      ? '⏳ מתחבר...'
                      : missingConnections.length === 1 ? '🔗 חבר עכשיו' : '🔗 חברו חשבונות'}
                  </button>
                </div>
              )}

              {showConnectionsModal && (
                <div className="connections-modal-backdrop" role="presentation" onMouseDown={() => setShowConnectionsModal(false)}>
                  <section className="connections-modal" role="dialog" aria-modal="true" aria-labelledby="connections-modal-title" onMouseDown={event => event.stopPropagation()}>
                    <button className="connections-modal-close" type="button" onClick={() => setShowConnectionsModal(false)} aria-label="סגירה">×</button>
                    <div className="connections-modal-heading">
                      <span>🔗</span>
                      <div>
                        <h2 id="connections-modal-title">חברו את החשבונות שלכם</h2>
                        <p>חברו את ערוצי הפרסום כדי שתוכלו ליצור, לתזמן ולפרסם מ־Possbo במקום אחד.</p>
                      </div>
                    </div>
                    <div className="connections-modal-list">
                      {connections.map(connection => (
                        <div className={`connections-modal-row connection-${connection.id} ${connection.connected ? 'is-connected' : ''}`} key={connection.id}>
                          <i>{connection.icon}</i>
                          <div>
                            <strong>{connection.name}</strong>
                            <small>{connection.connected ? 'מחובר ומוכן לפרסום' : 'עדיין לא מחובר'}</small>
                          </div>
                          {connection.connected ? (
                            <span className="connection-ready">✓ מחובר</span>
                          ) : (
                            <button type="button" disabled={connectingPlatform === connection.id || (connection.id === 'facebook' && bootstrapping)} onClick={connection.action}>
                              {connectingPlatform === connection.id || (connection.id === 'facebook' && bootstrapping) ? 'מתחבר...' : 'חבר חשבון'}
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                    <footer>
                      <button type="button" onClick={() => setShowConnectionsModal(false)}>אעשה זאת אחר כך</button>
                      <small>תוכלו לנהל את החיבורים בכל עת דרך ניהול החשבון.</small>
                    </footer>
                  </section>
                </div>
              )}

              {connectingPlatform === 'facebook' && !facebookLiveUrl && (
                <div className="connections-modal-backdrop facebook-browser-backdrop" role="presentation">
                  <section className="facebook-connect-loading" role="status" aria-live="polite">
                    <div className="wa-connect-spinner" />
                    <h2>מכינים חיבור מאובטח ל־Facebook</h2>
                    <p>יצירת הדפדפן עשויה להימשך מספר שניות. אין לסגור את החלון.</p>
                  </section>
                </div>
              )}

              {facebookLiveUrl && (
                <div className="connections-modal-backdrop facebook-browser-backdrop" role="presentation">
                  <section className="facebook-browser-modal" role="dialog" aria-modal="true" aria-labelledby="facebook-browser-title">
                    <header>
                      <div>
                        <h2 id="facebook-browser-title">חיבור מאובטח ל־Facebook</h2>
                        <p>התחברו ישירות בחלון Facebook. Possbo לא שומרת את הסיסמה שלכם.</p>
                      </div>
                      <div className="facebook-browser-actions">
                        <a href={facebookLiveUrl} target="_blank" rel="noopener noreferrer">פתח במסך מלא</a>
                        <button
                          type="button"
                          aria-label="סגירה"
                          onClick={async () => {
                            if (facebookConnectPollRef.current) clearInterval(facebookConnectPollRef.current)
                            facebookConnectPollRef.current = null
                            setFacebookLiveUrl(null)
                            setConnectingPlatform(null)
                            await groupsService.cancelRemoteFacebookSession().catch(() => {})
                          }}
                        >×</button>
                      </div>
                    </header>
                    <iframe
                      src={facebookLiveUrl}
                      title="Facebook secure connection"
                      allow="clipboard-read; clipboard-write"
                      referrerPolicy="no-referrer"
                    />
                    <footer>החלון ייסגר אוטומטית לאחר השלמת הכניסה. ניתן להשלים גם 2FA או checkpoint.</footer>
                  </section>
                </div>
              )}

              {quickWhatsappQr && (
                <div className="connections-modal-backdrop" role="presentation">
                  <section className="connections-modal quick-wa-modal" role="dialog" aria-modal="true" aria-labelledby="quick-wa-title">
                    <button
                      className="connections-modal-close"
                      type="button"
                      aria-label="סגירה"
                      onClick={() => {
                        setQuickWhatsappQr(null)
                        setConnectingPlatform(null)
                        if (quickWhatsappPollRef.current) clearInterval(quickWhatsappPollRef.current)
                        quickWhatsappPollRef.current = null
                      }}
                    >×</button>
                    <div className="quick-wa-logo"><WhatsAppLogo /></div>
                    <h2 id="quick-wa-title">חיבור WhatsApp</h2>
                    <p>פתחו את WhatsApp בטלפון ← הגדרות ← מכשירים מקושרים ← קישור מכשיר</p>
                    <img src={quickWhatsappQr} alt="קוד QR לחיבור WhatsApp" className="wa-qr-image" />
                    <div className="wa-connect-waiting">
                      <div className="wa-connect-spinner" />
                      <span>ממתינים לסריקה...</span>
                    </div>
                  </section>
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
                          <span className="kpi-card-label">קבוצות</span>
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
              {activeTab !== 'account' && activeTab !== 'stats' && activeTab !== 'overview' && activeTab !== 'groups' && (
                <div className={`filter-bar ${activeTab === 'campaigns' ? 'filter-bar-campaigns' : ''}`}>
                  <div className="filter-bar-search">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                    </svg>
                    <input
                      type="text"
                      placeholder={`חיפוש ${TABS.find(t => t.id === activeTab)?.label || ''}...`}
                      aria-label={`חיפוש ${TABS.find(t => t.id === activeTab)?.label || ''}`}
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                    />
                    {search && (
                      <button className="search-clear" onClick={() => setSearch('')} aria-label="נקה חיפוש">✕</button>
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
                      <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="filter-select" aria-label="סינון לפי סטטוס">
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
                      <select value={platformFilter} onChange={e => setPlatformFilter(e.target.value)} className="filter-select" aria-label="סינון לפי פלטפורמה">
                        <option value="all">כל הפלטפורמות</option>
                        <option value="facebook">פייסבוק בלבד</option>
                        <option value="instagram">אינסטגרם בלבד</option>
                        <option value="whatsapp">וואטסאפ בלבד</option>
                        <option value="both">משולב</option>
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
                                aria-label="חיפוש קבוצה לסינון"
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
                      <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="filter-select" aria-label="סינון פוסטים לפי סטטוס">
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
                                aria-label="חיפוש קבוצה לסינון"
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

                    <select value={sortBy} onChange={e => setSortBy(e.target.value)} className="filter-select" aria-label="מיון">
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

                    {/* Date range filter */}
                    {activeTab === 'campaigns' && (
                      <div className="filter-sheet-section">
                        <label className="filter-sheet-label">תקופה</label>
                        <div className="filter-sheet-date-range">
                          <label>
                            <span>מתאריך</span>
                            <input
                              type="date"
                              value={dashDateRange.from}
                              max={dashDateRange.to || undefined}
                              onChange={e => setDashDateRange(prev => ({ ...prev, from: e.target.value }))}
                            />
                          </label>
                          <label>
                            <span>עד תאריך</span>
                            <input
                              type="date"
                              value={dashDateRange.to}
                              min={dashDateRange.from || undefined}
                              onChange={e => setDashDateRange(prev => ({ ...prev, to: e.target.value }))}
                            />
                          </label>
                        </div>
                      </div>
                    )}

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
                            { value: 'whatsapp', label: 'וואטסאפ' },
                            { value: 'both', label: 'משולב' },
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
                              <input type="text" placeholder="חפש קבוצה..." value={sheetGroupSearch} onChange={e => setSheetGroupSearch(e.target.value)} autoFocus aria-label="חיפוש קבוצה לסינון" />
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
                              <input type="text" placeholder="חפש קבוצה..." value={sheetGroupSearch} onChange={e => setSheetGroupSearch(e.target.value)} autoFocus aria-label="חיפוש קבוצה לסינון" />
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
                                <input type="text" placeholder="חפש טמפלייט..." value={sheetTemplateSearch} onChange={e => setSheetTemplateSearch(e.target.value)} autoFocus aria-label="חיפוש טמפלייט לסינון" />
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
                {activeTab === 'campaigns' && <CampaignsPanel campaigns={filteredCampaigns} navigate={navigate} groups={groups} onUpdate={forceRefresh} onCampaignUpdated={updateCampaignEverywhere} viewMode={viewMode} posts={filteredPosts} subTab={campaignSubTab} />}
                {activeTab === 'groups' && <GroupsPanel groups={groups} navigate={navigate} sessionRequired={sessionRequired} onRefresh={handleRefreshGroups} refreshing={refreshingGroups} />}
                {activeTab === 'posts' && <PostsPanel posts={filteredPosts} navigate={navigate} groups={groups} onUpdate={forceRefresh} viewMode={viewMode} />}
                {activeTab === 'stats' && (
                  <StatsPanel stats={stats} posts={posts} />
                )}
                {activeTab === 'account' && <AccountPanel user={user} logout={logout} setUser={setUser} navigate={navigate} handleBootstrap={handleBootstrap} bootstrapping={bootstrapping} />}
              </div>
            </>
          )}
        </div>
      </div>

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
            updateCampaignEverywhere(overviewDetail.id, data)
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

function CampaignsPanel({ campaigns, navigate, groups, onUpdate, onCampaignUpdated, viewMode, subTab }) {
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
      setLocalCampaigns(prev => prev.map(campaign => campaign.id === id
        ? { ...campaign, ...data, ...(data.text !== undefined ? { content: data.text } : {}) }
        : campaign
      ))
      onCampaignUpdated?.(id, data)
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
        {subTab === 'scheduled' && (
          <Link to="/create-post" className="empty-btn scheduled-empty-btn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <rect x="3" y="5" width="18" height="16" rx="2" />
              <path d="M16 3v4M8 3v4M3 10h18" />
              <path d="M12 14v3l2 1" />
            </svg>
            צור את הקמפיין המתוזמן הראשון שלך
          </Link>
        )}
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
          <span className="cl-col cl-col-exposure cl-sortable" onClick={() => handleCampaignSort('exposure')}>
            חשיפה {sortKey === 'exposure' && <span className="cl-sort-icon">{sortDir === 'asc' ? '↑' : '↓'}</span>}
          </span>
          <span className="cl-col cl-col-date cl-sortable" onClick={() => handleCampaignSort('date')}>
            תאריך {sortKey === 'date' && <span className="cl-sort-icon">{sortDir === 'asc' ? '↑' : '↓'}</span>}
          </span>
          <span className="cl-col cl-col-actions"></span>
        </div>
        {sortedCampaigns.map(campaign => {
          const allImages = getCampaignImages(campaign)
          const thumbImages = allImages.slice(0, 4)
          const extraImgs = allImages.length - 4
          return (
            <div key={campaign.id} className={`cl-row ${menuId === campaign.id ? 'cl-row-menu-open' : ''}`} onClick={() => setDetailCampaign(campaign)}>
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
                  {campaign.whatsappEnabled && <span className="platform-badge platform-whatsapp">WA</span>}
                </div>
              </div>
              {/* Status */}
              <div className="cl-col cl-col-status">
                <span className={`cl-status-badge ${STATUS_CLASSES[campaign.status] || 'badge-active'}`}>
                  {STATUS_LABELS[campaign.status] || campaign.status}
                </span>
              </div>
              {/* Exposure */}
              <div className="cl-col cl-col-exposure">
                <span className="cl-exposure-val" title="חשיפה משוערת">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                    <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" />
                    <circle cx="12" cy="12" r="2.5" />
                  </svg>
                  {formatExposure(campaign.totalExposure)}
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
                  <button
                    className="actions-dots-btn"
                    onClick={(e) => { e.stopPropagation(); setMenuId(menuId === campaign.id ? null : campaign.id) }}
                    aria-label="פתח תפריט פעולות"
                    aria-haspopup="menu"
                    aria-expanded={menuId === campaign.id}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>
                  </button>
                  {menuId === campaign.id && (
                    <div className="actions-dropdown" role="menu" aria-label="פעולות קמפיין">
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
        const allImages = getCampaignImages(campaign)
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
                <button
                  className="actions-dots-btn"
                  onClick={(e) => { e.stopPropagation(); setMenuId(menuId === campaign.id ? null : campaign.id) }}
                  aria-label="פתח תפריט פעולות"
                  aria-haspopup="menu"
                  aria-expanded={menuId === campaign.id}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>
                </button>
                {menuId === campaign.id && (
                  <div className="actions-dropdown" role="menu" aria-label="פעולות קמפיין">
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

// ─── WHATSAPP SYNC PANEL ───────────────────────────────

function WhatsAppSyncPanel({ user }) {
  const { waGroups: groups, waBroadcastLists: broadcastLists, waSyncing: syncing, waError: error,
    loadWaGroups, syncWaGroups, setUser, setWaBroadcastLists } = useAppData()
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [waSubTab, setWaSubTab] = useState('groups') // 'groups' | 'broadcasts'
  const [connectQr, setConnectQr] = useState(null)
  const [connecting, setConnecting] = useState(false)
  const [connectMode, setConnectMode] = useState('qr') // 'qr' | 'phone'
  const [phoneInput, setPhoneInput] = useState('')
  const [pairingCode, setPairingCode] = useState(null)
  const [showBroadcastForm, setShowBroadcastForm] = useState(false)
  const [editingBroadcast, setEditingBroadcast] = useState(null)
  const [broadcastName, setBroadcastName] = useState('')
  const [broadcastMembers, setBroadcastMembers] = useState([{ phone: '', name: '' }])
  const [broadcastSaving, setBroadcastSaving] = useState(false)
  const [expandedBroadcast, setExpandedBroadcast] = useState(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState(null)
  const [showAllMembers, setShowAllMembers] = useState({})
  const pollRef = useRef(null)
  const membersListRef = useRef(null)

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current) }, [])

  // Reload groups when sync completes (e.g. auto-sync after connect)
  useEffect(() => {
    const onSyncDone = () => { loadWaGroups() }
    window.addEventListener('possbo-wa-sync-done', onSyncDone)
    return () => window.removeEventListener('possbo-wa-sync-done', onSyncDone)
  }, [loadWaGroups])

  useEffect(() => {
    if (user?.whatsappSessionConnected) {
      setLoading(true)
      loadWaGroups().finally(() => setLoading(false))
    }
  }, [user?.whatsappSessionConnected]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleConnect = async () => {
    setConnecting(true)
    try {
      const res = await authAPI.connectWhatsapp()
      if (res.data?.connected) {
        setUser(prev => ({ ...prev, whatsappSessionConnected: true, whatsappSessionPhone: res.data.phone || null }))
        setConnecting(false)
        return
      }
      if (res.data?.qrDataUrl) {
        setConnectQr(res.data.qrDataUrl)
        startConnectionPoll()
      }
    } catch (err) {
      logClientError('wa_connect_failed', err, { source: 'Dashboard' })
      setConnecting(false)
    }
  }

  const handleConnectPhone = async () => {
    const digits = phoneInput.replace(/\D/g, '')
    if (!digits || digits.length < 10) return
    setConnecting(true)
    setPairingCode(null)
    try {
      const res = await authAPI.connectWhatsappPhone(digits)
      if (res.data?.connected) {
        setUser(prev => ({ ...prev, whatsappSessionConnected: true, whatsappSessionPhone: res.data.phone || null }))
        setConnecting(false)
        return
      }
      if (res.data?.pairingCode) {
        setPairingCode(res.data.pairingCode)
        startConnectionPoll()
      }
    } catch (err) {
      logClientError('wa_connect_phone_failed', err, { source: 'Dashboard' })
      setConnecting(false)
    }
  }

  const startConnectionPoll = () => {
    if (pollRef.current) clearInterval(pollRef.current)
    pollRef.current = setInterval(async () => {
      try {
        const status = await authAPI.getWhatsappStatus()
        if (status.data?.connected) {
          clearInterval(pollRef.current)
          pollRef.current = null
          setConnectQr(null)
          setPairingCode(null)
          setConnecting(false)
          setUser(prev => ({
            ...prev,
            whatsappSessionConnected: true,
            whatsappSessionPhone: status.data.phone || null,
          }))
        }
      } catch { /* ignore */ }
    }, 5000)
  }

  const handleSync = async () => {
    await syncWaGroups()
  }

  // ── Broadcast list form helpers ──
  const openNewBroadcast = () => {
    setEditingBroadcast(null)
    setBroadcastName('')
    setBroadcastMembers([{ phone: '', name: '' }])
    setShowBroadcastForm(true)
  }

  const openEditBroadcast = (bl) => {
    setEditingBroadcast(bl)
    setBroadcastName(bl.name)
    setBroadcastMembers(bl.members?.length ? bl.members.map(m => ({ phone: m.phone || '', name: m.name || '' })) : [{ phone: '', name: '' }])
    setShowBroadcastForm(true)
  }

  const closeBroadcastForm = () => {
    setShowBroadcastForm(false)
    setEditingBroadcast(null)
    setBroadcastName('')
    setBroadcastMembers([{ phone: '', name: '' }])
  }

  const addMemberRow = () => {
    if (broadcastMembers.length >= 100) return
    setBroadcastMembers(prev => [...prev, { phone: '', name: '' }])
    window.requestAnimationFrame(() => {
      if (membersListRef.current) {
        membersListRef.current.scrollTo({ top: membersListRef.current.scrollHeight, behavior: 'smooth' })
      }
    })
  }

  const removeMemberRow = (idx) => {
    setBroadcastMembers(prev => prev.filter((_, i) => i !== idx))
  }

  const updateMember = (idx, field, value) => {
    setBroadcastMembers(prev => prev.map((m, i) => i === idx ? { ...m, [field]: value } : m))
  }

  const handleSaveBroadcast = async () => {
    const validMembers = broadcastMembers.filter(m => m.phone.trim())
    if (!broadcastName.trim()) return
    if (!validMembers.length) return
    if (validMembers.length > 100) return

    setBroadcastSaving(true)
    try {
      if (editingBroadcast) {
        const res = await authAPI.updateWhatsappBroadcastList(editingBroadcast.id, {
          name: broadcastName.trim(),
          members: validMembers,
        })
        setWaBroadcastLists(prev => prev.map(bl => bl.id === editingBroadcast.id ? res.data.list : bl))
      } else {
        const res = await authAPI.createWhatsappBroadcastList({
          name: broadcastName.trim(),
          members: validMembers,
        })
        setWaBroadcastLists(prev => [res.data.list, ...prev])
      }
      closeBroadcastForm()
    } catch (err) {
      logClientError('wa_broadcast_save_failed', err, { source: 'Dashboard' })
    } finally {
      setBroadcastSaving(false)
    }
  }

  const handleDeleteBroadcast = async (id) => {
    try {
      await authAPI.deleteWhatsappBroadcastList(id)
      setWaBroadcastLists(prev => prev.filter(bl => bl.id !== id))
      setDeleteConfirmId(null)
    } catch (err) {
      logClientError('wa_broadcast_delete_failed', err, { source: 'Dashboard' })
    }
  }

  if (!user?.whatsappSessionConnected) {
    return (
      <div className="wa-connect-panel">
        <div className="wa-connect-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#25D366" strokeWidth="1.5">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
          </svg>
        </div>
        {connectQr ? (
          <>
            <h3>סרקי את קוד ה-QR</h3>
            <p>פתח את וואטסאפ בטלפון ← הגדרות ← מכשירים מקושרים ← קשר מכשיר</p>
            <img src={connectQr} alt="QR Code" className="wa-qr-image" />
            <div className="wa-connect-waiting">
              <div className="wa-connect-spinner"></div>
              <span>ממתינה לסריקה...</span>
            </div>
            <button className="wa-mode-switch" onClick={() => { setConnectQr(null); setConnecting(false); if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null } setConnectMode('phone') }}>
              📱 חיבור עם מספר טלפון במקום
            </button>
          </>
        ) : pairingCode ? (
          <>
            <h3>הזן את הקוד בוואטסאפ</h3>
            <p>פתח את וואטסאפ ← הגדרות ← מכשירים מקושרים ← קשר מכשיר ← קישור עם מספר טלפון</p>
            <div className="wa-pairing-code">{pairingCode}</div>
            <div className="wa-connect-waiting">
              <div className="wa-connect-spinner"></div>
              <span>ממתינה לאישור...</span>
            </div>
            <button className="wa-mode-switch" onClick={() => { setPairingCode(null); setConnecting(false); if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null } setConnectMode('qr') }}>
              🔲 חיבור עם QR במקום
            </button>
          </>
        ) : (
          <>
            <h3>חבר את חשבון הוואטסאפ</h3>
            <p>סנכרן קבוצות ישירות מוואטסאפ</p>
            <div className="wa-connect-mode-tabs">
              <button className={`wa-mode-tab ${connectMode === 'qr' ? 'active' : ''}`} onClick={() => setConnectMode('qr')}>🔲 סריקת QR</button>
              <button className={`wa-mode-tab ${connectMode === 'phone' ? 'active' : ''}`} onClick={() => setConnectMode('phone')}>📱 מספר טלפון</button>
            </div>
            {connectMode === 'qr' ? (
              <button className="wa-connect-btn" onClick={handleConnect} disabled={connecting}>
                {connecting ? (
                  <><div className="wa-connect-spinner"></div> מתחבר...</>
                ) : (
                  <>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                    חבר חשבון וואטסאפ
                  </>
                )}
              </button>
            ) : (
              <div className="wa-phone-connect">
                <input
                  type="tel"
                  className="wa-phone-input"
                  placeholder="מספר טלפון עם קידומת מדינה (למשל 972501234567)"
                  value={phoneInput}
                  onChange={(e) => setPhoneInput(e.target.value)}
                  dir="ltr"
                  disabled={connecting}
                />
                <button className="wa-connect-btn" onClick={handleConnectPhone} disabled={connecting || phoneInput.replace(/\D/g, '').length < 10}>
                  {connecting ? (
                    <><div className="wa-connect-spinner"></div> מתחבר...</>
                  ) : 'קבלי קוד חיבור'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    )
  }

  // Filtered items by search
  const filteredGroups = groups.filter(g => !search || (g.name || '').toLowerCase().includes(search.toLowerCase()))
  const filteredBroadcasts = broadcastLists.filter(bl => !search || (bl.name || '').toLowerCase().includes(search.toLowerCase()))
  const validMemberCount = broadcastMembers.filter(m => m.phone.trim()).length

  return (
    <div className="wa-sync-panel">
      {/* ── Sub-Tabs: קבוצות / תפוצה ── */}
      <div className="wa-inner-tabs">
        <button className={`wa-inner-tab ${waSubTab === 'groups' ? 'active' : ''}`} onClick={() => { setWaSubTab('groups'); setSearch('') }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
          קבוצות
          <span className="wa-tab-count">{groups.length}</span>
        </button>
        <button className={`wa-inner-tab ${waSubTab === 'broadcasts' ? 'active' : ''}`} onClick={() => { setWaSubTab('broadcasts'); setSearch('') }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 010 14.14"/><path d="M15.54 8.46a5 5 0 010 7.07"/></svg>
          תפוצה
          <span className="wa-tab-count">{broadcastLists.length}</span>
        </button>
      </div>

      {error && <div className="wa-sync-error">{error}</div>}

      {/* ═══ GROUPS SUB-TAB ═══ */}
      {waSubTab === 'groups' && (
        <>
          <div className="wa-sync-toolbar">
            <div className="wa-sync-search">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input type="text" placeholder="חפש קבוצה..." value={search} onChange={e => setSearch(e.target.value)} dir="rtl" aria-label="חיפוש קבוצת וואטסאפ" />
              {search && <button className="wa-search-clear" onClick={() => setSearch('')} aria-label="נקה חיפוש">✕</button>}
            </div>
            <button className="wa-sync-refresh" onClick={handleSync} disabled={syncing} title="סנכרן קבוצות מוואטסאפ">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={syncing ? 'spinning' : ''}>
                <path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0115.45-6.36L21 8"/>
                <path d="M3 22v-6h6"/><path d="M21 12a9 9 0 01-15.45 6.36L3 16"/>
              </svg>
            </button>
          </div>

          {loading && !groups.length ? (
            <div className="wa-sync-loading">
              <div className="wa-sync-spinner"></div>
              <p>טוען קבוצות...</p>
            </div>
          ) : filteredGroups.length === 0 ? (
            <div className="empty-state">
              <h3>{search ? 'לא נמצאו תוצאות' : 'אין קבוצות'}</h3>
              <p>{search ? 'נסה לשנות את החיפוש' : 'לחץ על רענון כדי לסנכרן קבוצות מוואטסאפ'}</p>
            </div>
          ) : (
            <div className="wa-contacts-list">
              {filteredGroups.map(g => (
                <div key={g.id} className="wa-contact-row wa-contact-group">
                  <div className="wa-contact-avatar">
                    <div className="wa-contact-avatar-fallback">👥</div>
                  </div>
                  <div className="wa-contact-info">
                    <h4>{g.name}</h4>
                    <span className="wa-contact-meta">{g.participants || 0} משתתפים</span>
                  </div>
                  <span className="wa-badge wa-badge-group">קבוצה</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ═══ BROADCASTS SUB-TAB ═══ */}
      {waSubTab === 'broadcasts' && (
        <>
          <div className="wa-sync-toolbar">
            <div className="wa-sync-search">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input type="text" placeholder="חפש רשימת תפוצה..." value={search} onChange={e => setSearch(e.target.value)} dir="rtl" aria-label="חיפוש רשימת תפוצה" />
              {search && <button className="wa-search-clear" onClick={() => setSearch('')} aria-label="נקה חיפוש">✕</button>}
            </div>
            <button className="wa-add-broadcast-btn" onClick={openNewBroadcast} title="צור רשימת תפוצה חדשה">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </button>
          </div>

          {/* ── Create / Edit Form ── */}
          {showBroadcastForm && (
            <div className="wa-broadcast-form">
              <div className="wa-broadcast-form-header">
                <div className="wa-broadcast-form-title">
                  <span className="wa-broadcast-form-icon">{editingBroadcast ? '✏️' : '📋'}</span>
                  <h4>{editingBroadcast ? 'ערוך רשימת תפוצה' : 'רשימת תפוצה חדשה'}</h4>
                </div>
                <button className="wa-broadcast-form-close" onClick={closeBroadcastForm}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>

              <div className="wa-broadcast-field">
                <label className="wa-broadcast-label">שם הרשימה</label>
                <input
                  type="text"
                  className="wa-broadcast-name-input"
                  placeholder="לדוגמה: לקוחות VIP, צוות מכירות..."
                  value={broadcastName}
                  onChange={e => setBroadcastName(e.target.value)}
                  dir="rtl"
                  maxLength={80}
                />
              </div>

              <div className="wa-broadcast-members">
                <div className="wa-broadcast-members-header">
                  <label className="wa-broadcast-label">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4-4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
                    אנשי קשר
                  </label>
                  <span className={`wa-broadcast-counter ${validMemberCount >= 100 ? 'limit' : ''}`}>
                    {validMemberCount} / 100
                  </span>
                </div>
                <div className="wa-broadcast-members-list" ref={membersListRef}>
                  {broadcastMembers.map((m, idx) => (
                    <div key={idx} className="wa-broadcast-member-row">
                      <span className="wa-member-index">{idx + 1}</span>
                      <div className="wa-member-inputs">
                        <input
                          type="tel"
                          placeholder="972501234567"
                          value={m.phone}
                          onChange={e => updateMember(idx, 'phone', e.target.value)}
                          dir="ltr"
                          className="wa-member-phone-input"
                        />
                        <input
                          type="text"
                          placeholder="שם (אופציונלי)"
                          value={m.name}
                          onChange={e => updateMember(idx, 'name', e.target.value)}
                          dir="rtl"
                          className="wa-member-name-input"
                        />
                      </div>
                      {broadcastMembers.length > 1 && (
                        <button className="wa-broadcast-remove-btn" onClick={() => removeMemberRow(idx)} title="הסר">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                {broadcastMembers.length < 100 && (
                  <button className="wa-broadcast-add-member" onClick={addMemberRow}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    הוסף מספר
                  </button>
                )}
              </div>

              <div className="wa-broadcast-form-actions">
                <button className="wa-broadcast-save-btn" onClick={handleSaveBroadcast} disabled={broadcastSaving || !broadcastName.trim() || validMemberCount === 0}>
                  {broadcastSaving ? (
                    <><div className="wa-connect-spinner" style={{ width: 14, height: 14 }}></div> שומר...</>
                  ) : (
                    <>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
                      {editingBroadcast ? 'עדכן רשימה' : 'צור רשימה'}
                    </>
                  )}
                </button>
                <button className="wa-broadcast-cancel-btn" onClick={closeBroadcastForm}>ביטול</button>
              </div>
            </div>
          )}

          {/* ── Broadcast Lists ── */}
          {!showBroadcastForm && filteredBroadcasts.length === 0 ? (
            <div className="wa-broadcasts-empty">
              <div className="wa-broadcasts-empty-icon">📢</div>
              <h3>{search ? 'לא נמצאו תוצאות' : 'אין רשימות תפוצה'}</h3>
              <p>{search ? 'נסי לשנות את החיפוש' : 'צרי רשימת תפוצה חדשה כדי לשלוח הודעות למספרי טלפון'}</p>
              {!search && (
                <button className="wa-broadcasts-empty-btn" onClick={openNewBroadcast}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  צור רשימת תפוצה
                </button>
              )}
            </div>
          ) : !showBroadcastForm && (
            <div className="wa-broadcast-cards">
              {filteredBroadcasts.map(bl => {
                const isExpanded = expandedBroadcast === bl.id
                const memberCount = bl.members?.length || 0
                return (
                  <div key={bl.id} className={`wa-broadcast-card ${isExpanded ? 'expanded' : ''}`}>
                    <div className="wa-broadcast-card-header" onClick={() => setExpandedBroadcast(isExpanded ? null : bl.id)}>
                      <div className="wa-broadcast-card-icon">📢</div>
                      <div className="wa-broadcast-card-info">
                        <h4>{bl.name}</h4>
                        <span className="wa-broadcast-card-meta">{memberCount} אנשי קשר</span>
                      </div>
                      <div className="wa-broadcast-card-actions">
                        <button className="wa-broadcast-edit-btn" onClick={e => { e.stopPropagation(); openEditBroadcast(bl) }} title="ערוך">
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        </button>
                        <button className="wa-broadcast-delete-btn" onClick={e => { e.stopPropagation(); setDeleteConfirmId(bl.id) }} title="מחק">
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                        </button>
                        <svg className={`wa-broadcast-chevron ${isExpanded ? 'open' : ''}`} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
                      </div>
                    </div>

                    {/* Delete confirmation */}
                    {deleteConfirmId === bl.id && (
                      <div className="wa-broadcast-delete-confirm">
                        <p>למחוק את רשימת התפוצה "{bl.name}"?</p>
                        <div className="wa-broadcast-delete-confirm-btns">
                          <button className="wa-broadcast-confirm-yes" onClick={() => handleDeleteBroadcast(bl.id)}>מחק</button>
                          <button className="wa-broadcast-confirm-no" onClick={() => setDeleteConfirmId(null)}>ביטול</button>
                        </div>
                      </div>
                    )}

                    {/* Expanded member list */}
                    {isExpanded && deleteConfirmId !== bl.id && (
                      <div className="wa-broadcast-card-members">
                        {(bl.members || []).length === 0 ? (
                          <p className="wa-broadcast-no-members">אין אנשי קשר ברשימה</p>
                        ) : (() => {
                          const members = bl.members || []
                          const LIMIT = 8
                          const isShowingAll = showAllMembers[bl.id]
                          const visible = isShowingAll ? members : members.slice(0, LIMIT)
                          const remaining = members.length - LIMIT
                          return (
                            <>
                              <div className="wa-broadcast-members-grid">
                                {visible.map((m, i) => (
                                  <div key={i} className="wa-broadcast-member-chip">
                                    <span className="wa-member-chip-phone">{m.phone}</span>
                                    {m.name && <span className="wa-member-chip-name">{m.name}</span>}
                                  </div>
                                ))}
                              </div>
                              {members.length > LIMIT && (
                                <button
                                  className="wa-broadcast-show-more"
                                  onClick={e => { e.stopPropagation(); setShowAllMembers(prev => ({ ...prev, [bl.id]: !prev[bl.id] })) }}
                                >
                                  {isShowingAll ? 'הצג פחות ▲' : `הצג עוד ${remaining} אנשי קשר ▼`}
                                </button>
                              )}
                            </>
                          )
                        })()}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function GroupsPanel({ groups, navigate, sessionRequired, onRefresh, refreshing }) {
  const { user } = useAppData()
  const [groupsSubTab, setGroupsSubTab] = useState('facebook') // 'facebook' | 'whatsapp'
  const [detailGroup, setDetailGroup] = useState(null)
  const [visibleCount, setVisibleCount] = useState(15)
  const [sortKey, setSortKey] = useState(null) // 'name' | 'members' | 'posts' | 'scheduled'
  const [sortDir, setSortDir] = useState('desc') // 'asc' | 'desc'
  const [search, setSearch] = useState('')
  const [viewMode, setViewMode] = useState('list') // 'list' | 'grid'
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
    let list = groups
    // Search filter
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(g => g.name?.toLowerCase().includes(q))
    }
    // Sort
    if (!sortKey) return list
    const sorted = [...list].sort((a, b) => {
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
  }, [groups, sortKey, sortDir, search])

  const visibleGroups = sortedGroups.slice(0, visibleCount)
  const hasMore = sortedGroups.length > visibleCount

  if (groupsSubTab === 'whatsapp') {
    return (
      <div>
        <div className="groups-sub-tabs">
          <button className={`groups-sub-tab ${groupsSubTab === 'facebook' ? 'active' : ''}`} onClick={() => setGroupsSubTab('facebook')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="#1877F2"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
            קבוצות פייסבוק
          </button>
          <button className={`groups-sub-tab ${groupsSubTab === 'whatsapp' ? 'active' : ''}`} onClick={() => setGroupsSubTab('whatsapp')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="#25D366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
            וואטסאפ
          </button>
        </div>
        <WhatsAppSyncPanel user={user} navigate={navigate} />
      </div>
    )
  }

  if (sessionRequired) return (
    <div>
      <div className="groups-sub-tabs">
        <button className={`groups-sub-tab ${groupsSubTab === 'facebook' ? 'active' : ''}`} onClick={() => setGroupsSubTab('facebook')}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="#1877F2"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
          קבוצות פייסבוק
        </button>
        <button className={`groups-sub-tab ${groupsSubTab === 'whatsapp' ? 'active' : ''}`} onClick={() => setGroupsSubTab('whatsapp')}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="#25D366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
          וואטסאפ
        </button>
      </div>
      <div className="empty-state">
        <div className="empty-icon-wrap">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>
          </svg>
        </div>
        <h3>נדרש חיבור לפייסבוק</h3>
        <p>חבר את חשבון הפייסבוק שלך מהבאנר למעלה כדי לסנכרן קבוצות</p>
      </div>
    </div>
  )

  if (!groups.length) return (
    <div>
      <div className="groups-sub-tabs">
        <button className={`groups-sub-tab ${groupsSubTab === 'facebook' ? 'active' : ''}`} onClick={() => setGroupsSubTab('facebook')}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="#1877F2"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
          קבוצות פייסבוק
        </button>
        <button className={`groups-sub-tab ${groupsSubTab === 'whatsapp' ? 'active' : ''}`} onClick={() => setGroupsSubTab('whatsapp')}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="#25D366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
          וואטסאפ
        </button>
      </div>
      <div className="empty-state">
      <div className="empty-icon-wrap">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>
        </svg>
      </div>
      <h3>אין קבוצות שמורות</h3>
      <p>סנכרן את הקבוצות שלך מפייסבוק באמצעות כפתור "רענן קבוצות" למעלה</p>
    </div>
    </div>
  )

  return (
    <div>

      {/* ═══ Sub-Tabs ═══ */}
      <div className="groups-sub-tabs">
        <button className={`groups-sub-tab ${groupsSubTab === 'facebook' ? 'active' : ''}`} onClick={() => setGroupsSubTab('facebook')}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="#1877F2"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
          קבוצות פייסבוק
        </button>
        <button className={`groups-sub-tab ${groupsSubTab === 'whatsapp' ? 'active' : ''}`} onClick={() => setGroupsSubTab('whatsapp')}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="#25D366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
          וואטסאפ
        </button>
      </div>

      {/* ═══ Groups Toolbar (search, sort, view toggle, refresh) ═══ */}
      <div className="fb-groups-toolbar">
        <div className="fb-groups-search">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            type="text"
            placeholder="חפש קבוצה..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            dir="rtl"
          />
          {search && <button className="fb-groups-search-clear" onClick={() => setSearch('')}>✕</button>}
        </div>
        <select className="fb-groups-sort" value={sortKey || ''} onChange={e => { setSortKey(e.target.value || null); setSortDir('desc') }} aria-label="מיון קבוצות">
          <option value="">ללא מיון</option>
          <option value="name">מיון לפי שם</option>
          <option value="members">מיון לפי חברים</option>
          <option value="posts">מיון לפי פוסטים</option>
        </select>
        <button className="fb-groups-view-toggle" onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')} title={viewMode === 'grid' ? 'תצוגת שורות' : 'תצוגת ריבועים'}>
          {viewMode === 'grid'
            ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
            : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
          }
        </button>
        <button className="fb-groups-refresh" onClick={onRefresh} disabled={refreshing} title="רענן קבוצות מפייסבוק">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={refreshing ? 'spinning' : ''}>
            <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
          </svg>
        </button>
      </div>

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
          <div className="modal-content group-detail-modal" role="dialog" aria-modal="true" aria-label="פרטי קבוצה" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setDetailGroup(null)} aria-label="סגור פרטי קבוצה">✕</button>
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

function PostsPanel({ posts, groups, onUpdate, viewMode }) {
  const [menuId, setMenuId] = useState(null)
  const [reschedulePost, setReschedulePost] = useState(null)
  const [detailPost, setDetailPost] = useState(null)
  const [loading, setLoading] = useState(false)
  const [localPosts, setLocalPosts] = useState(posts)
  const [, setConfirmAction] = useState(null)
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

  const resolvePostImg = resolveImg
  const handleImgError2 = (e) => { e.target.style.display = 'none'; e.target.parentElement.classList.add('card-img-broken') }

  return (
    <>
    <div className={`campaigns-grid ${viewMode === 'list' ? 'campaigns-list-view' : ''}`}>
      {localPosts.map(item => {
        const allImages = getRenderableImages(item.post?.images || item.images || [])
        const cardImages = allImages.slice(0, 3)
        const extraImgs = allImages.length - 3
        return (
        <div key={item.id} className="campaign-card">
          <div className={`campaign-card-visual card-imgs-${Math.min(allImages.length, 3)}`} onClick={() => setDetailPost(item)}>
            {cardImages.length > 0
              ? <>
                  {cardImages.map((img, i) => (
                    <div key={i} className={`card-img-cell ${i === 0 ? 'card-img-main' : 'card-img-side'}`}>
                      <img src={resolvePostImg(img)} alt="" onError={handleImgError2} />
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
                <button
                  className="actions-dots-btn"
                  onClick={(e) => { e.stopPropagation(); setMenuId(menuId === item.id ? null : item.id) }}
                  aria-label="פתח תפריט פעולות"
                  aria-haspopup="menu"
                  aria-expanded={menuId === item.id}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>
                </button>
                {menuId === item.id && (
                  <div className="actions-dropdown" role="menu" aria-label="פעולות פרסום">
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
            <button type="button" key={i}
              className={`drp-day ${!day ? 'empty' : ''} ${day && isInRange(day) ? 'in-range' : ''} ${day && isStart(day) ? 'range-start' : ''} ${day && isEnd(day) ? 'range-end' : ''} ${day && dayToStr(day) === toDS(today) ? 'today' : ''}`}
              disabled={!day}
              onClick={() => day && handleDayClick(day)}
              onMouseEnter={() => { if (rangeStart && !rangeEnd && day) setHoverDate(dayToStr(day)) }}
              aria-label={day ? `בחר ${dayToStr(day)}` : undefined}
            >{day || ''}</button>
          ))}
        </div>
      </div>
      <div className="drp-inputs">
        <div className="drp-input-group"><label>מ-</label><input type="date" value={manualFrom} onChange={e => { setManualFrom(e.target.value); setRangeStart(e.target.value) }} onKeyDown={e => e.key === 'Enter' && handleManualApply()} aria-label="תאריך התחלה" /></div>
        <div className="drp-input-group"><label>עד</label><input type="date" value={manualTo} onChange={e => { setManualTo(e.target.value); setRangeEnd(e.target.value) }} onKeyDown={e => e.key === 'Enter' && handleManualApply()} aria-label="תאריך סיום" /></div>
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
              <Bar dataKey="avgLikes" fill="var(--indigo)" radius={[4, 4, 0, 0]} name="avgLikes" background={false} />
              <Bar dataKey="avgComments" fill="#10B981" radius={[4, 4, 0, 0]} name="avgComments" background={false} />
            </BarChart>
          ) : (
            <AreaChart width={timesChartSize.width || 300} height={timesChartSize.height || 220} data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="timesLikesGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--indigo)" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="var(--indigo)" stopOpacity={0} />
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
              <Area type="monotone" dataKey="avgLikes" stroke="var(--indigo)" strokeWidth={2} fill="url(#timesLikesGrad)" name="avgLikes" activeDot={{ r: 6, fill: 'var(--indigo)', stroke: '#fff', strokeWidth: 2 }} />
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
  const [performancePlatform, setPerformancePlatform] = useState('instagram')
  const [platformInsights, setPlatformInsights] = useState({
    instagram: { count: 0, likes: 0, comments: 0, shares: 0, views: 0, reach: 0, formats: [] },
    facebook: { count: 0, likes: 0, comments: 0, exposure: 0 },
    whatsapp: { postsSent: 0, groupsReached: 0, peopleReached: 0, totalDistribution: 0 },
  })
  const [exposureChartRef, exposureChartSize] = useContainerSize()

  // Top posts state
  const [topPostsSort, setTopPostsSort] = useState('likes')
  const [topPostsPlatform, setTopPostsPlatform] = useState('all')
  const [refreshingAll, setRefreshingAll] = useState(false)

  // Cache helpers
  const getCached = useCallback((from, to) => {
    void from
    void to
    return null
  }, [])
  const isCacheStale = useCallback((from, to) => {
    void from
    void to
    return true
  }, [])
  const getTopPostsCached = useCallback((sort, from, to) => {
    void sort
    void from
    void to
    return null
  }, [])
  const isTopPostsCacheStale = useCallback((sort, from, to) => {
    void sort
    void from
    void to
    return true
  }, [])
  const setCache = useCallback((from, to, data) => {
    void from
    void to
    void data
  }, [])
  const setTopPostsCache = useCallback((sort, from, to, data) => {
    void sort
    void from
    void to
    void data
  }, [])

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

  const loadPlatformInsights = useCallback(async () => {
    const res = await groupsService.getWhatsAppStats(dateRange)
    if (res.data?.instagram && res.data?.facebook && res.data?.whatsapp) {
      setPlatformInsights({
        instagram: res.data.instagram,
        facebook: res.data.facebook,
        whatsapp: res.data.whatsapp,
      })
    }
  }, [dateRange])

  useEffect(() => {
    loadPlatformInsights().catch(() => {})
  }, [loadPlatformInsights])

  useEffect(() => {
    const refresh = (event) => {
      if (event?.detail?.success === false) return
      loadPlatformInsights().catch(() => {})
    }
    window.addEventListener('possbo-sync-done', refresh)
    window.addEventListener('possbo-wa-sync-done', refresh)
    window.addEventListener('possbo-metrics-updated', refresh)
    return () => {
      window.removeEventListener('possbo-sync-done', refresh)
      window.removeEventListener('possbo-wa-sync-done', refresh)
      window.removeEventListener('possbo-metrics-updated', refresh)
    }
  }, [loadPlatformInsights])

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

      <div className={`stats-chart-card stats-platform-card stats-platform-${performancePlatform}`}>
        <div className="stats-platform-tabs" role="tablist" aria-label="בחירת רשת חברתית">
          <button
            type="button"
            role="tab"
            aria-selected={performancePlatform === 'instagram'}
            className={performancePlatform === 'instagram' ? 'active instagram' : ''}
            onClick={() => setPerformancePlatform('instagram')}
          >
            Instagram
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={performancePlatform === 'facebook'}
            className={performancePlatform === 'facebook' ? 'active facebook' : ''}
            onClick={() => setPerformancePlatform('facebook')}
          >
            Facebook
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={performancePlatform === 'whatsapp'}
            className={performancePlatform === 'whatsapp' ? 'active whatsapp' : ''}
            onClick={() => setPerformancePlatform('whatsapp')}
          >
            WhatsApp
          </button>
        </div>

        {performancePlatform === 'instagram' ? (
          <div role="tabpanel">
            <div className="stats-platform-heading">
              <h4>ביצועי Instagram</h4>
              <span>{platformInsights.instagram.count} פרסומים</span>
            </div>
            <div className="stats-network-kpis">
              <div><strong>{formatNumber(platformInsights.instagram.views)}</strong><span>צפיות</span></div>
              <div><strong>{formatNumber(platformInsights.instagram.likes)}</strong><span>לייקים</span></div>
              <div><strong>{formatNumber(platformInsights.instagram.comments)}</strong><span>תגובות</span></div>
              <div><strong>{formatNumber(platformInsights.instagram.shares)}</strong><span>שיתופים</span></div>
              <div><strong>{formatNumber(platformInsights.instagram.reach)}</strong><span>חשיפה</span></div>
            </div>
            <div className="stats-format-list">
              {platformInsights.instagram.formats.map(format => {
                const max = Math.max(...platformInsights.instagram.formats.map(item => item.views), 1)
                return (
                  <div className="stats-format-row" key={format.type}>
                    <span>{format.type === 'FEED' ? 'פוסטים' : format.type === 'REEL' ? 'רילס' : 'סטוריז'} ({format.count})</span>
                    <div className="stats-format-track"><i style={{ width: `${format.views ? Math.max(4, (format.views / max) * 100) : 0}%` }}/></div>
                    <strong>{formatNumber(format.views)} צפיות · {formatNumber(format.interactions)} אינטראקציות</strong>
                  </div>
                )
              })}
            </div>
          </div>
        ) : performancePlatform === 'facebook' ? (
          <div role="tabpanel">
            <div className="stats-platform-heading">
              <h4>ביצועי Facebook</h4>
              <span>נתונים זמינים בלבד</span>
            </div>
            <div className="stats-network-kpis stats-network-kpis-facebook">
              <div><strong>{formatNumber(platformInsights.facebook.count)}</strong><span>פרסומים</span></div>
              <div><strong>{formatNumber(platformInsights.facebook.likes)}</strong><span>לייקים</span></div>
              <div><strong>{formatNumber(platformInsights.facebook.comments)}</strong><span>תגובות</span></div>
              <div><strong>{formatNumber(platformInsights.facebook.exposure)}</strong><span>חשיפה משוערת</span></div>
            </div>
            <p className="stats-platform-note">צפיות ושיתופים אינם מוצגים בפייסבוק כל עוד אין עבורם נתון אמין מהמקור.</p>
          </div>
        ) : (
          <div role="tabpanel">
            <div className="stats-platform-heading">
              <h4>ביצועי WhatsApp</h4>
              <span>לפי הפרסומים שנשלחו בתקופה שנבחרה</span>
            </div>
            <div className="stats-network-kpis stats-network-kpis-whatsapp">
              <div><strong>{formatNumber(platformInsights.whatsapp.postsSent)}</strong><span>פוסטים שנשלחו</span></div>
              <div><strong>{formatNumber(platformInsights.whatsapp.groupsReached)}</strong><span>קבוצות</span></div>
              <div><strong>{formatNumber(platformInsights.whatsapp.peopleReached)}</strong><span>אנשים בקהל</span></div>
              <div><strong>{formatNumber(platformInsights.whatsapp.totalDistribution)}</strong><span>תפוצה כוללת</span></div>
            </div>
            <p className="stats-platform-note">כמות האנשים מחושבת לפי מספר המשתתפים המעודכן בקבוצות ולפי הנמענים ברשימות התפוצה. תפוצה כוללת כוללת גם שליחות חוזרות לאותו קהל.</p>
          </div>
        )}
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
                      <stop offset="0%" stopColor="var(--indigo)" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="var(--indigo)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" tick={{ fill: '#6b7684', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#6b7684', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={formatNumber} domain={[0, 'auto']} width={35} />
                  <Tooltip
                    cursor={false}
                    contentStyle={{ background: '#1e2028', border: '1px solid #2a2f3a', borderRadius: 8, color: '#e2e8f0' }}
                    formatter={(val) => [formatNumber(val), 'חשיפה']}
                  />
                  <Area type={chartData.length >= 2 ? 'monotone' : 'linear'} dataKey="exposure" stroke="var(--indigo)" strokeWidth={2} fill="url(#exposureGradient)" dot={{ r: 5, fill: 'var(--indigo)', stroke: '#1e2028', strokeWidth: 2 }} activeDot={{ r: 7, fill: 'var(--indigo)', stroke: '#fff', strokeWidth: 2 }} />
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
                  <Bar dataKey="exposure" fill="var(--indigo)" radius={[4, 4, 0, 0]} background={false} />
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
              className="top-posts-refresh-btn"
              onClick={() => {
                if (refreshingAll) return
                setRefreshingAll(true)
                window.dispatchEvent(new CustomEvent('possbo-op-start', {
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
                    await loadPlatformInsights()
                    const count = refreshRes.data?.refreshed || 0
                    window.dispatchEvent(new CustomEvent('possbo-op-done', {
                      detail: { id: 'refresh-all-metrics', success: true, msg: `✅ רענון הושלם! עודכנו ${count} פרסומים` }
                    }))
                  })
                  .catch(() => {
                    window.dispatchEvent(new CustomEvent('possbo-op-done', {
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
            <span
              className="metrics-last-sync"
              title={topPosts.find(p => p.lastSyncedAt || p.collectedAt)?.lastSyncedAt || topPosts.find(p => p.collectedAt)?.collectedAt || ''}
            >
              {(() => {
                const latest = topPosts
                  .map(p => p.lastSyncedAt || p.collectedAt)
                  .filter(Boolean)
                  .sort((a, b) => new Date(b) - new Date(a))[0]
                return latest ? formatMetricsTimestamp(latest) : 'טרם בוצע סנכרון מדדים'
              })()}
            </span>
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
                    <span className="metrics-last-sync">
                      {formatMetricsTimestamp(p.lastSyncedAt || p.collectedAt, p.publishedAt)}
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



function SettingsPanel({ user, logout, setUser, navigate, handleBootstrap, bootstrapping }) {
  const {  themeMode, setTheme } = useTheme()
  const { cancelWaSync } = useAppData()
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
  const [waMsgEditing, setWaMsgEditing] = useState(false)
  const [waValidation, setWaValidation] = useState(null)
  // WhatsApp connect modal
  const [waConnectModal, setWaConnectModal] = useState(null) // { qrDataUrl } | { pairingCode } | null
  const [waConnectMode, setWaConnectMode] = useState('qr') // 'qr' | 'phone'
  const [waPhoneInput, setWaPhoneInput] = useState('')
  const [waConnecting, setWaConnecting] = useState(false)
  const waConnectPollRef = useRef(null)

  // Clean up WA connect polling on unmount
  useEffect(() => () => { if (waConnectPollRef.current) clearInterval(waConnectPollRef.current) }, [])

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
        <div className="settings-hero-glow" />
        <div className="settings-hero-content">
          {/* Avatar — appears on RIGHT in RTL */}
          <div className="settings-hero-avatar-side">
            <div className="settings-avatar-wrap">
              <div className="settings-avatar">
                {(user?.profileImage || user?.avatarUrl) && (
                  <img src={(() => { const v = user.profileImage || user.avatarUrl; if (v.startsWith('uploads/')) return `/${v}`; return v })()} alt="" className="settings-avatar-img" onError={e => { e.target.style.display = 'none' }} />
                )}
                <span className="settings-avatar-letter">{user?.name?.[0] || '?'}</span>
              </div>
              <label className="settings-avatar-upload" title="העלה תמונה">
                <input type="file" accept="image/*" hidden aria-label="בחר תמונת פרופיל" onChange={async (e) => {
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
          </div>
          {/* Info — RIGHT aligned in RTL */}
          <div className="settings-hero-info">
            <h2 className="settings-hero-name">{user?.name || 'משתמש'}</h2>
            {user?.bio && <p className="settings-hero-bio">{user.bio}</p>}
            <div className="settings-hero-meta">
              <span className="settings-hero-meta-item">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
                {user?.email || ''}
              </span>
              <span className="settings-hero-meta-item">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>
                חבר מאז {user?.createdAt ? new Date(user.createdAt).toLocaleDateString('he-IL', { month: 'long', year: 'numeric' }) : ''}
              </span>
            </div>
          </div>
          {/* Pencil edit — floating bottom-left */}
          <button className="settings-hero-pencil" onClick={() => { setEditing(true); setEditName(user?.name || ''); setEditEmail(user?.email || '') }} title="ערוך פרופיל">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
          </button>
        </div>
        {/* Inline edit form */}
        {editing && (
          <div className="settings-hero-edit-form">
            <div className="settings-fields-grid">
              <div className="settings-field">
                <label>שם</label>
                <input value={editName} onChange={e => setEditName(e.target.value)} placeholder="השם שלך" aria-label="השם שלך" />
              </div>
              <div className="settings-field">
                <label>אימייל</label>
                <input value={editEmail} onChange={e => setEditEmail(e.target.value)} placeholder="email@example.com" type="email" dir="ltr" aria-label="כתובת אימייל" />
              </div>
            </div>
            {editError && <div className="settings-msg settings-msg-error">{editError}</div>}
            <div className="settings-field-actions">
              <button className="settings-btn-save" onClick={handleSaveProfile} disabled={saving}>
                {saving ? '⏳ שומר...' : 'שמור שינויים'}
              </button>
              <button className="settings-btn-cancel" onClick={() => setEditing(false)}>ביטול</button>
            </div>
          </div>
        )}
      </div>

      {/* ═══ Sections ═══ */}
      <div className="settings-sections-wrap">

        {/* ─── Connections Section ─── */}
        <section className="settings-sect">
          <div className="settings-sect-header">
            <h3 className="settings-sect-title">חשבונות מחוברים</h3>
            <span className="settings-sect-subtitle">נהל את החשבונות המחוברים שלך לפלטפורמות</span>
          </div>
          <div className="settings-sect-body">
            <div className="conn-list">

              {/* ── Facebook ── */}
              <div className={`conn-row ${user?.fbSessionValid ? 'conn-row--active' : ''}`}>
                <div className="conn-row-icon conn-row-icon--fb">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="#fff"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                </div>
                <div className="conn-row-info">
                  <span className="conn-row-name">פייסבוק</span>
                  <span className="conn-row-detail">{user?.fbSessionValid ? (user?.fbName || 'חשבון מחובר') : 'לא מחובר'}</span>
                </div>
                <div className="conn-row-actions">
                  {user?.fbSessionValid ? (
                    <>
                      <button className="conn-btn conn-btn--outline" onClick={handleBootstrap} disabled={bootstrapping}>
                        {bootstrapping ? '⏳' : 'החלף'}
                      </button>
                      <button className="conn-btn conn-btn--ghost-danger" onClick={handleDisconnectFB} disabled={disconnecting}>
                        {disconnecting ? '⏳' : 'נתק'}
                      </button>
                    </>
                  ) : (
                    <button className="conn-btn conn-btn--primary" onClick={handleBootstrap} disabled={bootstrapping}>
                      {bootstrapping ? '⏳ ממתין...' : 'חבר'}
                    </button>
                  )}
                </div>
              </div>

              {/* ── Instagram ── */}
              <div className={`conn-row ${user?.instagramConnected ? 'conn-row--active' : ''}`}>
                <div className="conn-row-icon conn-row-icon--ig">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="#fff">
                    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>
                  </svg>
                </div>
                <div className="conn-row-info">
                  <span className="conn-row-name">אינסטגרם</span>
                  <span className="conn-row-detail">{user?.instagramConnected ? `@${user.instagramUsername}` : 'לא מחובר'}</span>
                </div>
                <div className="conn-row-actions">
                  {user?.instagramConnected ? (
                    <>
                      <button className="conn-btn conn-btn--outline" onClick={async () => {
                        // Replace = disconnect then reconnect
                        try {
                          await authAPI.disconnectInstagram()
                          setUser(prev => ({ ...prev, instagramConnected: false, instagramUsername: null }))
                          // Immediately start reconnect flow
                          const res = await authAPI.getInstagramAuthUrl()
                          if (res.data.authUrl) {
                            const popup = window.open(res.data.authUrl, 'instagram-oauth', 'width=600,height=700,left=200,top=100')
                            const handleMessage = (event) => {
                              if (!event.data || event.data.type !== 'instagram-oauth-callback') return
                              window.removeEventListener('message', handleMessage)
                              if (event.data.success) {
                                setUser(prev => ({ ...prev, instagramConnected: true, instagramUsername: event.data.username }))
                              }
                            }
                            window.addEventListener('message', handleMessage)
                            const timer = setInterval(async () => {
                              if (popup?.closed) {
                                clearInterval(timer)
                                window.removeEventListener('message', handleMessage)
                                try {
                                  const statusRes = await authAPI.getInstagramStatus()
                                  if (statusRes?.data?.connected) {
                                    const updates = { instagramConnected: true, instagramUsername: statusRes.data.account?.username }
                                    if (statusRes.data.avatarUrl) updates.avatarUrl = statusRes.data.avatarUrl
                                    setUser(prev => ({ ...prev, ...updates }))
                                  }
                                } catch { /* ignore */ }
                              }
                            }, 500)
                          }
                        } catch (err) {
                          logClientError('instagram_reconnect_failed', err, { source: 'Dashboard' })
                          window.alert(err?.response?.data?.error || err?.userMessage || 'שגיאה בחיבור Instagram מחדש')
                        }
                      }}>
                        החלף
                      </button>
                      <button className="conn-btn conn-btn--ghost-danger" onClick={async () => {
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
                    </>
                  ) : (
                    <button className="conn-btn conn-btn--primary" onClick={async () => {
                      try {
                        const res = await authAPI.getInstagramAuthUrl()
                        if (res.data.authUrl) {
                          const popup = window.open(res.data.authUrl, 'instagram-oauth', 'width=600,height=700,left=200,top=100')
                          if (!popup) {
                            logClientWarning('instagram_popup_blocked', 'Instagram OAuth popup could not be opened', { source: 'Dashboard' })
                          }
                          const handleMessage = (event) => {
                            if (!event.data || event.data.type !== 'instagram-oauth-callback') return
                            window.removeEventListener('message', handleMessage)
                            if (event.data.success) {
                              setUser(prev => ({ ...prev, instagramConnected: true, instagramUsername: event.data.username }))
                            }
                          }
                          window.addEventListener('message', handleMessage)
                          const timer = setInterval(async () => {
                            if (popup?.closed) {
                              clearInterval(timer)
                              window.removeEventListener('message', handleMessage)
                              try {
                                const statusRes = await authAPI.getInstagramStatus()
                                if (statusRes?.data?.connected) {
                                  const updates = { instagramConnected: true, instagramUsername: statusRes.data.account?.username }
                                  if (statusRes.data.avatarUrl) updates.avatarUrl = statusRes.data.avatarUrl
                                  setUser(prev => ({ ...prev, ...updates }))
                                }
                              } catch (err) { logClientError('instagram_status_check_failed', err, { source: 'Dashboard' }) }
                            }
                          }, 500)
                        }
                      } catch (err) {
                        logClientError('instagram_auth_url_failed', err, { source: 'Dashboard' })
                        window.alert(err?.response?.data?.error || err?.userMessage || 'שגיאה ביצירת קישור חיבור')
                      }
                    }}>
                      חבר
                    </button>
                  )}
                </div>
              </div>

              {/* ── WhatsApp Session (Baileys) ── */}
              <div className={`conn-row ${user?.whatsappSessionConnected ? 'conn-row--active' : ''}`}>
                <div className="conn-row-icon conn-row-icon--wa">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="#fff"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                </div>
                <div className="conn-row-info">
                  <span className="conn-row-name">וואטסאפ</span>
                  <span className="conn-row-detail">{user?.whatsappSessionConnected ? (user.whatsappSessionPhone || 'מחובר') : 'לא מחובר'}</span>
                </div>
                <div className="conn-row-actions">
                  {user?.whatsappSessionConnected ? (
                    <>
                      <button className="conn-btn conn-btn--outline" onClick={handleBootstrap} disabled={bootstrapping}>
                        {bootstrapping ? '⏳' : 'החלף'}
                      </button>
                      <button className="conn-btn conn-btn--ghost-danger" disabled={disconnecting} onClick={() => {
                        setConfirmAction({
                          title: 'ניתוק וואטסאפ',
                          message: 'האם אתה בטוח שברצונך לנתק את חיבור הוואטסאפ? לא תוכל לשלוח הודעות עד שתתחבר מחדש.',
                          action: async () => {
                            cancelWaSync()
                            setDisconnecting(true)
                            try {
                              await authAPI.disconnectWhatsapp()
                              setUser(prev => ({ ...prev, whatsappSessionConnected: false, whatsappSessionPhone: null }))
                            } catch { /* ignore */ }
                            finally { setDisconnecting(false) }
                          }
                        })
                      }}>
                        {disconnecting ? '⏳' : 'נתק'}
                      </button>
                    </>
                  ) : (
                    <button className="conn-btn conn-btn--primary" onClick={async () => {
                      try {
                        const res = await authAPI.connectWhatsapp()
                        if (res.data.qrDataUrl) {
                          const qrPopup = window.open('', 'whatsapp-qr', 'width=450,height=550,left=200,top=100')
                          qrPopup.document.write(`
                            <!DOCTYPE html><html dir="rtl"><head><title>חיבור וואטסאפ</title>
                            <style>body{font-family:sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#111;color:#fff}
                            img{width:280px;height:280px;border-radius:12px;margin:16px 0}h2{margin:0 0 8px;font-size:18px}p{margin:0;color:#999;font-size:14px;text-align:center;max-width:320px}
                            .spinner{border:3px solid #333;border-top:3px solid #25D366;border-radius:50%;width:32px;height:32px;animation:spin 1s linear infinite;margin:16px}
                            @keyframes spin{to{transform:rotate(360deg)}}</style></head><body>
                            <h2>סרוק את קוד ה-QR</h2>
                            <p>פתח את וואטסאפ בטלפון ← הגדרות ← מכשירים מקושרים ← קשר מכשיר</p>
                            <img src="${res.data.qrDataUrl}" alt="QR Code" />
                            <p>ממתין לסריקה...</p>
                            <div class="spinner"></div>
                            </body></html>
                          `)
                          const pollTimer = setInterval(async () => {
                            if (qrPopup?.closed) { clearInterval(pollTimer); return }
                            try {
                              const status = await authAPI.getWhatsappStatus()
                              if (status.data?.connected) {
                                clearInterval(pollTimer)
                                setUser(prev => ({
                                  ...prev,
                                  whatsappSessionConnected: true,
                                  whatsappSessionPhone: status.data.phone || null,
                                }))
                                qrPopup.document.body.innerHTML = '<h2 style="color:#25D366">✓ מחובר בהצלחה!</h2><p>ניתן לסגור חלון זה</p>'
                                setTimeout(() => qrPopup.close(), 2000)
                              } else if (status.data?.qrDataUrl) {
                                const img = qrPopup.document.querySelector('img')
                                if (img) img.src = status.data.qrDataUrl
                              }
                            } catch { /* ignore */ }
                          }, 3000)
                        }
                      } catch (err) {
                        logClientError('wa_connect_failed', err, { source: 'DashboardSettings' })
                        window.alert('שגיאה ביצירת חיבור וואטסאפ')
                      }
                    }}>
                      חבר
                    </button>
                  )}
                </div>
              </div>

              {/* ── WhatsApp Contact Info ── */}
              <div className={`conn-row ${user?.whatsappNumber ? 'conn-row--active' : ''}`}>
                <div className="conn-row-icon conn-row-icon--wa-biz">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                </div>
                <div className="conn-row-info">
                  <span className="conn-row-name">וואטסאפ עסקי</span>
                  <span className="conn-row-detail">{user?.whatsappNumber || 'לא מחובר'}</span>
                </div>
                <div className="conn-row-actions">
                  {user?.whatsappNumber && !waEditing ? (
                    <>
                      <button className="conn-btn conn-btn--outline" onClick={() => { setWaEditing(true); setWaNumber(user.whatsappNumber); setWaMessage(user.whatsappMessage || ''); setWaValidation(null) }}>
                        ערוך
                      </button>
                      <button className="conn-btn conn-btn--ghost-danger" onClick={handleRemoveWhatsapp} disabled={waSaving}>
                        הסר
                      </button>
                    </>
                  ) : !user?.whatsappNumber && !waEditing ? (
                    <button className="conn-btn conn-btn--primary" onClick={() => setWaEditing(true)}>
                      חבר
                    </button>
                  ) : null}
                </div>
              </div>
            </div>

            {/* WhatsApp edit form — below the list */}
            {waEditing && (
              <div className="conn-expand-form">
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

            {/* WhatsApp custom message — inline display or edit */}
            {user?.whatsappNumber && !waEditing && (
              <div className="settings-wa-message-row">
                <span className="settings-wa-message-label">הודעה מותאמת:</span>
                {waMsgEditing ? (
                  <div className="settings-wa-message-edit">
                    <input
                      value={waMessage}
                      onChange={e => setWaMessage(e.target.value)}
                      placeholder="היי, ראיתי את הפוסט שלך..."
                      dir="rtl"
                      autoFocus
                    />
                    <button className="settings-btn-save settings-btn-sm" onClick={() => { handleSaveWaMessage(); setWaMsgEditing(false) }} disabled={waSaving}>
                      {waSaving ? '⏳' : '💾'}
                    </button>
                    <button className="settings-btn-cancel settings-btn-sm" onClick={() => { setWaMsgEditing(false); setWaMessage(user?.whatsappMessage || '') }}>
                      ✕
                    </button>
                  </div>
                ) : (
                  <div className="settings-wa-message-display" onClick={() => setWaMsgEditing(true)}>
                    <span className="settings-wa-message-text">{user?.whatsappMessage || 'לא הוגדרה'}</span>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="settings-wa-message-edit-icon"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  </div>
                )}
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
                    <input type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} placeholder="הזן סיסמה נוכחית" dir="ltr" aria-label="סיסמה נוכחית" />
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
                        <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="לפחות 6 תווים" dir="ltr" aria-label="סיסמה חדשה" />
                      </div>
                      <div className="settings-field">
                        <label>אימות סיסמה חדשה</label>
                        <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="הזן שוב" dir="ltr" aria-label="אימות סיסמה חדשה" />
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

        {/* ─── Preferences Section ─── */}
        <section className="settings-sect">
          <div className="settings-sect-header">
            <h3 className="settings-sect-title">העדפות</h3>
            <span className="settings-sect-subtitle">התאם את חווית השימוש שלך</span>
          </div>
          <div className="settings-sect-body">
            <div className="conn-list">
              {/* Theme */}
              <div className="pref-row">
                <div className="pref-row-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>
                </div>
                <div className="pref-row-info">
                  <span className="pref-row-label">ערכת נושא</span>
                </div>
                <div className="pref-row-control">
                  <div className="pref-segmented">
                    <button className={`pref-seg-btn ${themeMode === 'light' ? 'active' : ''}`} onClick={() => setTheme('light')}>
                      ☀️ בהיר
                    </button>
                    <button className={`pref-seg-btn ${themeMode === 'dark' ? 'active' : ''}`} onClick={() => setTheme('dark')}>
                      🌙 כהה
                    </button>
                    <button className={`pref-seg-btn ${themeMode === 'system' ? 'active' : ''}`} onClick={() => setTheme('system')}>
                      🖥️ לפי מערכת
                    </button>
                  </div>
                </div>
              </div>

              {/* Language */}
              <div className="pref-row">
                <div className="pref-row-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>
                </div>
                <div className="pref-row-info">
                  <span className="pref-row-label">שפת ממשק</span>
                </div>
                <div className="pref-row-control">
                  <span className="pref-row-value">עברית</span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
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
        <span aria-hidden="true"> | </span>
        <Link to="/accessibility-statement">הצהרת נגישות</Link>
        <span aria-hidden="true"> | </span>
        <Link to="/cancellation-policy">ביטול עסקה</Link>
        <span aria-hidden="true"> | </span>
        <Link to="/contact">צור קשר</Link>
      </div>

      {/* ─── WhatsApp Connect Modal ─── */}
      {waConnectModal !== null && (
        <div className="confirm-overlay" onClick={() => { setWaConnectModal(null); setWaConnecting(false); setWaPhoneInput(''); if (waConnectPollRef.current) { clearInterval(waConnectPollRef.current); waConnectPollRef.current = null } }}>
          <div className="confirm-dialog wa-connect-modal" onClick={(e) => e.stopPropagation()}>
            <button className="wa-connect-modal-close" onClick={() => { setWaConnectModal(null); setWaConnecting(false); setWaPhoneInput(''); if (waConnectPollRef.current) { clearInterval(waConnectPollRef.current); waConnectPollRef.current = null } }}>✕</button>
            <div className="wa-connect-icon">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="#25D366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
            </div>
            {waConnectModal.qrDataUrl ? (
              <>
                <h3 className="confirm-title">סרקי את קוד ה-QR</h3>
                <p className="confirm-message">פתח את וואטסאפ בטלפון ← הגדרות ← מכשירים מקושרים ← קשר מכשיר</p>
                <img src={waConnectModal.qrDataUrl} alt="QR Code" className="wa-qr-image" style={{ margin: '12px auto', display: 'block' }} />
                <div className="wa-connect-waiting">
                  <div className="wa-connect-spinner"></div>
                  <span>ממתינה לסריקה...</span>
                </div>
                <button className="wa-mode-switch" onClick={() => { setWaConnectModal({}); setWaConnecting(false); if (waConnectPollRef.current) { clearInterval(waConnectPollRef.current); waConnectPollRef.current = null } setWaConnectMode('phone') }}>
                  📱 חיבור עם מספר טלפון במקום
                </button>
              </>
            ) : waConnectModal.pairingCode ? (
              <>
                <h3 className="confirm-title">הזן את הקוד בוואטסאפ</h3>
                <p className="confirm-message">פתח את וואטסאפ ← הגדרות ← מכשירים מקושרים ← קשר מכשיר ← קישור עם מספר טלפון</p>
                <div className="wa-pairing-code">{waConnectModal.pairingCode}</div>
                <div className="wa-connect-waiting">
                  <div className="wa-connect-spinner"></div>
                  <span>ממתינה לאישור...</span>
                </div>
                <button className="wa-mode-switch" onClick={() => { setWaConnectModal({}); setWaConnecting(false); if (waConnectPollRef.current) { clearInterval(waConnectPollRef.current); waConnectPollRef.current = null } setWaConnectMode('qr') }}>
                  🔲 חיבור עם QR במקום
                </button>
              </>
            ) : (
              <>
                <h3 className="confirm-title">חיבור וואטסאפ</h3>
                <p className="wa-connect-subtitle">בחרו איך לחבר את החשבון. ההתחברות מאובטחת ומתבצעת מול וואטסאפ.</p>
                <div className="wa-connect-mode-tabs">
                  <button className={`wa-mode-tab ${waConnectMode === 'qr' ? 'active' : ''}`} onClick={() => setWaConnectMode('qr')}>
                    <span className="wa-mode-tab-icon">▦</span>
                    <span>סריקת QR</span>
                  </button>
                  <button className={`wa-mode-tab ${waConnectMode === 'phone' ? 'active' : ''}`} onClick={() => setWaConnectMode('phone')}>
                    <span className="wa-mode-tab-icon">☎</span>
                    <span>מספר טלפון</span>
                  </button>
                </div>
                {waConnectMode === 'qr' ? (
                  <button className="wa-connect-btn" disabled={waConnecting} onClick={async () => {
                    setWaConnecting(true)
                    try {
                      const res = await authAPI.connectWhatsapp()
                      if (res.data?.connected) {
                        setUser(prev => ({ ...prev, whatsappSessionConnected: true, whatsappSessionPhone: res.data.phone || null }))
                        setWaConnectModal(null); setWaConnecting(false)
                        return
                      }
                      if (res.data?.qrDataUrl) {
                        setWaConnectModal({ qrDataUrl: res.data.qrDataUrl })
                        waConnectPollRef.current = setInterval(async () => {
                          try {
                            const status = await authAPI.getWhatsappStatus()
                            if (status.data?.connected) {
                              clearInterval(waConnectPollRef.current); waConnectPollRef.current = null
                              setUser(prev => ({ ...prev, whatsappSessionConnected: true, whatsappSessionPhone: status.data.phone || null }))
                              setWaConnectModal(null); setWaConnecting(false)
                            } else if (status.data?.qrDataUrl) {
                              setWaConnectModal({ qrDataUrl: status.data.qrDataUrl })
                            }
                          } catch { /* ignore */ }
                        }, 3000)
                      }
                    } catch (err) {
                      logClientError('wa_connect_failed', err, { source: 'DashboardSettings' })
                      setWaConnecting(false)
                    }
                  }}>
                    {waConnecting ? <><div className="wa-connect-spinner"></div> מתחבר...</> : 'התחבר עם QR'}
                  </button>
                ) : (
                  <div className="wa-phone-connect">
                    <input
                      type="tel"
                      className="wa-phone-input"
                      placeholder="מספר עם קידומת מדינה (972501234567)"
                      value={waPhoneInput}
                      onChange={(e) => setWaPhoneInput(e.target.value)}
                      dir="ltr"
                      disabled={waConnecting}
                    />
                    <button className="wa-connect-btn" disabled={waConnecting || waPhoneInput.replace(/\D/g, '').length < 10} onClick={async () => {
                      const digits = waPhoneInput.replace(/\D/g, '')
                      setWaConnecting(true)
                      try {
                        const res = await authAPI.connectWhatsappPhone(digits)
                        if (res.data?.connected) {
                          setUser(prev => ({ ...prev, whatsappSessionConnected: true, whatsappSessionPhone: res.data.phone || null }))
                          setWaConnectModal(null); setWaConnecting(false)
                          return
                        }
                        if (res.data?.pairingCode) {
                          setWaConnectModal({ pairingCode: res.data.pairingCode })
                          waConnectPollRef.current = setInterval(async () => {
                            try {
                              const status = await authAPI.getWhatsappStatus()
                              if (status.data?.connected) {
                                clearInterval(waConnectPollRef.current); waConnectPollRef.current = null
                                setUser(prev => ({ ...prev, whatsappSessionConnected: true, whatsappSessionPhone: status.data.phone || null }))
                                setWaConnectModal(null); setWaConnecting(false)
                              }
                            } catch { /* ignore */ }
                          }, 3000)
                        }
                      } catch (err) {
                        logClientError('wa_connect_phone_failed', err, { source: 'DashboardSettings' })
                        setWaConnecting(false)
                      }
                    }}>
                      {waConnecting ? <><div className="wa-connect-spinner"></div> מתחבר...</> : 'קבלי קוד חיבור'}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

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
  const existingEditImgs = getCampaignImages(campaign).map(resolveImg)
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
      <div className="modal-content edit-campaign-modal" role="dialog" aria-modal="true" aria-label="עריכת קמפיין" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>עריכת קמפיין</h3>
          <button className="modal-close" onClick={onClose} aria-label="סגור עריכת קמפיין">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="modal-body">
          <div className="form-group">
            <label>כותרת</label>
            <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="כותרת (אופציונלי)" aria-label="כותרת קמפיין" />
          </div>

          <div className="form-group">
            <label>תוכן הפוסט</label>
            <textarea value={text} onChange={e => setText(e.target.value)} rows={4} aria-label="תוכן הפוסט" />
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
                  <input type="file" accept="image/*" multiple onChange={handleImageSelect} hidden aria-label="בחר תמונות" />
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
                    <button type="button" onClick={() => toggleGroup(g.id)} aria-label={`הסר את ${g.name || 'הקבוצה'} מהבחירה`}>✕</button>
                  </span>
                ))}
                {selectedGroupObjects.length > 4 && (
                  <button type="button" className="groups-expand-btn" onClick={() => setShowAllGroups(!showAllGroups)}>
                    {showAllGroups ? 'הצג פחות' : `+${selectedGroupObjects.length - 4} נוספות`}
                  </button>
                )}
              </div>
            )}
            <input type="text" className="group-search-input" value={groupSearch} onChange={e => setGroupSearch(e.target.value)} placeholder="🔍 חפש קבוצה..." aria-label="חיפוש קבוצה" />
            <div className="group-checkboxes">
              {filteredGroups.map(g => (
                <label key={g.id} className={`group-checkbox ${selectedGroups.includes(g.id) ? 'checked' : ''}`}>
                  <input type="checkbox" checked={selectedGroups.includes(g.id)} onChange={() => toggleGroup(g.id)} aria-label={`בחר את ${g.name || 'הקבוצה'}`} />
                  <span>{g.name}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="form-row">
            <label className="checkbox-label">
              <input type="checkbox" checked={anonymous} onChange={e => setAnonymous(e.target.checked)} aria-label="פרסם כאנונימי" />
              פרסום אנונימי
            </label>
          </div>

          <div className="form-group">
            <label>מיקום</label>
            <input type="text" value={location} onChange={e => setLocation(e.target.value)} placeholder="מיקום (אופציונלי)" aria-label="מיקום" />
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
                <input type="date" value={scheduleDate} onChange={e => setScheduleDate(e.target.value)} aria-label="תאריך תזמון" />
              </div>
              <div className="form-group">
                <label>שעה</label>
                <input type="time" value={scheduleTime} onChange={e => setScheduleTime(e.target.value)} aria-label="שעת תזמון" />
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
                <input type="time" value={recurringTime} onChange={e => setRecurringTime(e.target.value)} aria-label="שעת פרסום חוזר" />
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
                <input type="text" value={whatsappNumber} onChange={e => setWhatsappNumber(e.target.value)} placeholder="מספר וואטסאפ" aria-label="מספר וואטסאפ" />
                <input type="text" value={whatsappMessage} onChange={e => setWhatsappMessage(e.target.value)} placeholder="הודעה מוכנה (אופציונלי)" style={{ marginTop: '8px' }} aria-label="הודעת וואטסאפ מוכנה" />
              </>
            )}
          </div>

          <div className="detail-edit-actions">
            <button type="submit" className="modal-submit-btn" disabled={loading}>
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
  const existingImages = getRenderableImages(post.post?.images || post.images || [])
    .map(url => url?.startsWith('/uploads') ? `${API_HOST}${url}` : url)
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
      <div className="modal-content reschedule-modal" role="dialog" aria-modal="true" aria-label="הפעלה מחדש" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>הפעלה מחדש</h3>
          <button className="modal-close" onClick={onClose} aria-label="סגור הפעלה מחדש">✕</button>
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
              <input type="file" accept="image/*" multiple onChange={handleImageSelect} hidden aria-label="בחר תמונות" />
            </label>
          </div>

          {/* Options */}
          <div className="form-row reschedule-options">
            <label className={`reschedule-option ${isAnonymous ? 'active' : ''}`}>
              <input type="checkbox" checked={isAnonymous} onChange={(e) => setIsAnonymous(e.target.checked)} hidden aria-label="פרסם כאנונימי" />
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
            <input type="text" className="group-search-input" value={groupSearch} onChange={e => setGroupSearch(e.target.value)} placeholder="🔍 חפש קבוצה..." aria-label="חיפוש קבוצה" />
            <div className="group-checkboxes">
              {filteredGroups.map(g => (
                <label key={g.id} className={`group-checkbox ${selectedGroups.includes(g.id) ? 'checked' : ''}`}>
                  <input type="checkbox" checked={selectedGroups.includes(g.id)} onChange={() => toggleGroup(g.id)} aria-label={`בחר את ${g.name || 'הקבוצה'}`} />
                  <span>{g.name}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Schedule */}
          <div className="form-row">
            <div className="form-group">
              <label>תאריך</label>
              <input type="date" value={scheduleDate} onChange={e => setScheduleDate(e.target.value)} required aria-label="תאריך תזמון" />
            </div>
            <div className="form-group">
              <label>שעה</label>
              <input type="time" value={scheduleTime} onChange={e => setScheduleTime(e.target.value)} required aria-label="שעת תזמון" />
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

function CampaignDetailModal({ campaign, onClose, onPause, onDuplicate, onDelete, groups, loading, onSave, initialEditing }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [editing, setEditing] = useState(!!initialEditing)
  const [lightboxIdx, setLightboxIdx] = useState(null)
  const [brokenImageUrls, setBrokenImageUrls] = useState([])
  const [historyOpen, setHistoryOpen] = useState(false)
  const [pubHistory, setPubHistory] = useState(null)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [refreshingId, setRefreshingId] = useState(null)
  const menuRef = useRef(null)

  // Load publication history lazily (on button click only)

  const images = getCampaignImages(campaign).filter(url => !brokenImageUrls.includes(url))
  const imgSrc = resolveImg

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
    window.dispatchEvent(new CustomEvent('possbo-op-start', { detail: { id: `refresh-${pubId}`, msg: 'מרענן מידע עבור פוסט זה...' } }))
    try {
      const res = await groupsService.refreshPublicationMetrics(pubId)
      if (res.data.success) {
        setPubHistory(prev => prev?.map(h => (h.id === pubId || h.originalId === pubId) ? { ...h, ...res.data.metrics } : h))
        window.dispatchEvent(new CustomEvent('possbo-op-done', { detail: { id: `refresh-${pubId}`, success: true, msg: `✅ מידע עודכן: ${res.data.metrics.likes} לייקים, ${res.data.metrics.comments} תגובות` } }))
      }
    } catch {
      window.dispatchEvent(new CustomEvent('possbo-op-done', { detail: { id: `refresh-${pubId}`, success: false, msg: '⚠️ שגיאה ברענון מידע' } }))
    }
    setRefreshingId(null)
  }

  const historyStatusLabel = (status) => {
    if (status === 'SUCCESS') return '✓ פורסם'
    if (status === 'FAILED') return '✕ נכשל'
    if (status === 'RUNNING') return '⏳ בתהליך'
    return '🕐 ממתין'
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
  const existingDetailImgs = getCampaignImages(campaign).map(resolveImg)
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
  const markImageBroken = (url) => {
    setBrokenImageUrls(prev => prev.includes(url) ? prev : [...prev, url])
    setLightboxIdx(null)
  }

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
      <div className="modal-content detail-modal" role="dialog" aria-modal="true" aria-label="פרטי קמפיין" onClick={e => e.stopPropagation()}>
        <div className="detail-modal-header">
          <button className="modal-close" onClick={onClose} aria-label="סגור פרטי קמפיין">✕</button>
          <div className="actions-menu-wrap" ref={menuRef}>
            <button className="actions-dots-btn" onClick={() => setMenuOpen(!menuOpen)} aria-label="פתח תפריט פעולות" aria-haspopup="menu" aria-expanded={menuOpen}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>
            </button>
            {menuOpen && (
              <div className="actions-dropdown" role="menu" aria-label="פעולות קמפיין">
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
                    <img src={imgSrc(img)} alt="" onError={() => markImageBroken(img)} />
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
            <img src={imgSrc(images[lightboxIdx])} alt="" onClick={e => e.stopPropagation()} onError={() => markImageBroken(images[lightboxIdx])} />
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
              <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="כותרת (אופציונלי)" aria-label="כותרת קמפיין" />
            </div>
            <div className="form-group">
              <label>תוכן הפוסט</label>
              <textarea value={text} onChange={e => setText(e.target.value)} rows={4} aria-label="תוכן הפוסט" />
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
                    <input type="file" accept="image/*" multiple onChange={handleImageSelect} hidden aria-label="בחר תמונות" />
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
                      <button type="button" onClick={() => toggleGroup(g.id)} aria-label={`הסר את ${g.name || 'הקבוצה'} מהבחירה`}>✕</button>
                    </span>
                  ))}
                  {selectedGroupObjects.length > 4 && (
                    <button type="button" className="groups-expand-btn" onClick={() => setShowAllGroups(!showAllGroups)}>
                      {showAllGroups ? 'הצג פחות' : `+${selectedGroupObjects.length - 4} נוספות`}
                    </button>
                  )}
                </div>
              )}
              <input type="text" className="group-search-input" value={groupSearch} onChange={e => setGroupSearch(e.target.value)} placeholder="🔍 חפש קבוצה..." aria-label="חיפוש קבוצה" />
              <div className="group-checkboxes">
                {filteredGroups.map(g => (
                  <label key={g.id} className={`group-checkbox ${selectedGroups.includes(g.id) ? 'checked' : ''}`}>
                    <input type="checkbox" checked={selectedGroups.includes(g.id)} onChange={() => toggleGroup(g.id)} aria-label={`בחר את ${g.name || 'הקבוצה'}`} />
                    <span>{g.name}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="form-row">
              <label className="checkbox-label">
                <input type="checkbox" checked={anonymous} onChange={e => setAnonymous(e.target.checked)} aria-label="פרסם כאנונימי" />
                פרסום אנונימי
              </label>
            </div>
            <div className="form-group">
              <label>מיקום</label>
              <input type="text" value={locationVal} onChange={e => setLocationVal(e.target.value)} placeholder="מיקום (אופציונלי)" aria-label="מיקום" />
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
                <div className="form-group"><label>תאריך</label><input type="date" value={scheduleDate} onChange={e => setScheduleDate(e.target.value)} aria-label="תאריך תזמון" /></div>
                <div className="form-group"><label>שעה</label><input type="time" value={scheduleTime} onChange={e => setScheduleTime(e.target.value)} aria-label="שעת תזמון" /></div>
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
                <div className="form-group"><label>שעה</label><input type="time" value={recurringTime} onChange={e => setRecurringTime(e.target.value)} aria-label="שעת פרסום חוזר" /></div>
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
                  <input type="text" value={whatsappNumber} onChange={e => setWhatsappNumber(e.target.value)} placeholder="מספר וואטסאפ" aria-label="מספר וואטסאפ" />
                  <input type="text" value={whatsappMessage} onChange={e => setWhatsappMessage(e.target.value)} placeholder="הודעה מוכנה (אופציונלי)" style={{ marginTop: '8px' }} aria-label="הודעת וואטסאפ מוכנה" />
                </>
              )}
            </div>
            <div className="detail-edit-actions">
              <button type="submit" className="modal-submit-btn" disabled={loading}>
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
                  {(campaign.whatsappEnabled || pubHistory?.some(h => h.platform === 'WHATSAPP')) && <span className="detail-platform-chip">וואטסאפ</span>}
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
              <div className="detail-history-section">
                <button className="detail-history-btn" onClick={loadHistory} disabled={historyLoading}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                  </svg>
                  {historyLoading ? 'טוען...' : historyOpen ? 'הסתר היסטוריית פרסומים' : 'היסטוריית פרסומים'}
                  {!historyOpen && campaign.publishedCount > 0 && <span className="detail-history-count">{campaign.publishedCount}</span>}
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
                            <span className={`detail-history-status ${h.status === 'SUCCESS' ? 'status-success' : h.status === 'FAILED' ? 'status-fail' : 'status-pending'}`}>
                              {historyStatusLabel(h.status)}
                            </span>
                          </div>
                          <div className="detail-history-card-stats">
                            {h.platform !== 'WHATSAPP' && (
                              <>
                                <span className="detail-history-stat" title="לייקים">
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3H14z"/><path d="M7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3"/></svg>
                                  {h.likes ?? '—'}
                                </span>
                                <span className="detail-history-stat" title="תגובות">
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
                                  {h.comments ?? '—'}
                                </span>
                                {h.platform === 'INSTAGRAM' && (
                                  <>
                                    <span className="detail-history-stat" title="שיתופים">↗ {h.shares ?? 0}</span>
                                    <span className="detail-history-stat" title="צפיות">👁 {h.views ?? 0}</span>
                                  </>
                                )}
                              </>
                            )}
                            {h.postUrl && h.platform !== 'WHATSAPP' && (
                              <a href={h.postUrl} target="_blank" rel="noopener noreferrer" className="detail-history-stat detail-history-link" title={h.platform === 'INSTAGRAM' ? 'פתח באינסטגרם' : 'פתח בפייסבוק'}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                                {h.platform === 'INSTAGRAM' ? 'צפה באינסטגרם' : 'צפה בפוסט'}
                              </a>
                            )}
                            {h.igPublishType === 'STORY' && !h.storyActive && (
                              <span className="detail-history-stat">הסטורי הסתיים · הנתונים נשמרו</span>
                            )}
                            {h.status === 'SUCCESS' && h.platform !== 'WHATSAPP' && !String(h.id).startsWith('job-') && (
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
                            {h.platform !== 'WHATSAPP' && (
                              <span className="metrics-last-sync">
                                {formatMetricsTimestamp(h.lastSyncedAt, h.publishedAt)}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
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
  const [brokenImageUrls, setBrokenImageUrls] = useState([])
  const menuRef = useRef(null)

  const images = getRenderableImages(item.post?.images || item.images || []).filter(url => !brokenImageUrls.includes(url))
  const [imageIdx, setImageIdx] = useState(0)
  const imgSrc = resolveImg
  const markImageBroken = (url) => {
    setBrokenImageUrls(prev => prev.includes(url) ? prev : [...prev, url])
    setImageIdx(0)
  }

  useEffect(() => {
    if (!menuOpen) return
    const handler = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content detail-modal" role="dialog" aria-modal="true" aria-label="פרטי פוסט" onClick={e => e.stopPropagation()}>
        <div className="detail-modal-header">
          <button className="modal-close" onClick={onClose} aria-label="סגור פרטי פוסט">✕</button>
          <div className="actions-menu-wrap" ref={menuRef}>
            <button className="actions-dots-btn" onClick={() => setMenuOpen(!menuOpen)} aria-label="פתח תפריט פעולות" aria-haspopup="menu" aria-expanded={menuOpen}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>
            </button>
            {menuOpen && (
              <div className="actions-dropdown" role="menu" aria-label="פעולות פוסט">
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
              <img src={imgSrc(images[imageIdx])} alt="" className="detail-main-image" onError={() => markImageBroken(images[imageIdx])} />
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
