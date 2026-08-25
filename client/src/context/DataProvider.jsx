import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react'
import { authAPI } from '../services/api'
import { clearAccessToken } from '../services/http'
import { groupsService } from '../services/groupsService'
import { logClientError } from '../services/clientLogger'

const DataContext = createContext(null)

// Cache TTL - data older than this will trigger a background refresh
const CACHE_TTL = 30_000 // 30 seconds
// Background polling interval (how often to check for stale data)
const POLL_INTERVAL = 20_000 // 20 seconds
// localStorage key for cached app data
const DATA_CACHE_KEY = 'possbo_app_data'
// localStorage key for cached WA contacts
const WA_CONTACTS_CACHE_KEY = 'possbo_wa_contacts'
const WA_BROADCASTS_CACHE_KEY = 'possbo_wa_broadcasts'

// Load cached data from localStorage (runs synchronously at module level for speed)
function loadCachedData() {
  return null
}

// localStorage key for cached user (for instant auth-checked feel)
const USER_CACHE_KEY = 'possbo_user'

function loadCachedUser() {
  return null
}

function saveCachedUser(_userData) {
  // Authentication state is restored from the httpOnly cookie and the DB.
}

function clearCachedUser() {
  try { localStorage.removeItem(USER_CACHE_KEY) } catch { /* ignore */ }
}

export function DataProvider({ children }) {
  // Load cached data synchronously on first render
  const cachedRef = useRef(loadCachedData())
  const cached = cachedRef.current
  const cachedUser = useRef(loadCachedUser()).current

  // Auth state — if we have a cached user, show the page immediately
  // (auth will be verified in background; if invalid, user gets redirected)
  const [user, setUser] = useState(cachedUser)
  const [authChecked, setAuthChecked] = useState(!!cachedUser)

  // Data stores — initialize from cache if available
  const [campaigns, setCampaigns] = useState(cached?.campaigns || [])
  const [groups, setGroups] = useState(cached?.groups || [])
  const [jobs, setJobs] = useState(cached?.jobs || [])
  const [posts, setPosts] = useState(cached?.posts || [])
  const [stats, setStats] = useState(cached?.stats || null)
  const [templates, setTemplates] = useState(cached?.templates || [])
  const [recentCampaigns, setRecentCampaigns] = useState(cached?.recentCampaigns || { drafts: [], history: [] })

  // Background refresh state
  const [refreshing, setRefreshing] = useState(false)
  const [dataReady, setDataReady] = useState(!!cached)
  const lastFetchRef = useRef({})
  const fetchInProgressRef = useRef(false)
  const fetchVersionRef = useRef(0) // prevents stale fetch results from overwriting fresh ones
  const authVerifiedRef = useRef(false) // true only after checkAuth completes (not just cached)
  const userRef = useRef(cachedUser)
  const pollTimerRef = useRef(null)
  const waStatusCheckedRef = useRef(false)

  // ── WhatsApp sync state (persists across page navigation) ──
  const [waGroups, setWaGroups] = useState(() => {
    return []
  })
  const [waBroadcastLists, setWaBroadcastLists] = useState(() => {
    return []
  })
  const [waSyncing, setWaSyncing] = useState(false)
  const [waQrDataUrl, setWaQrDataUrl] = useState(null)
  const [waError, setWaError] = useState(null)
  const waGroupsLoadedRef = useRef(false)

  // Load WA groups from DB (called once on auth, then on-demand)
  const loadWaGroups = useCallback(async () => {
    try {
      const [groupsRes, broadcastRes] = await Promise.all([
        authAPI.getWhatsappGroups(),
        authAPI.getWhatsappBroadcastLists(),
      ])
      const groups = groupsRes.data?.groups || []
      const lists = broadcastRes.data?.lists || []
      setWaGroups(groups)
      setWaBroadcastLists(lists)
      setWaError(null)
      waGroupsLoadedRef.current = true
      return { groups, broadcastLists: lists }
    } catch (err) {
      logClientError('wa_groups_load_failed', err, { source: 'DataProvider' })
      return { groups: waGroups, broadcastLists: waBroadcastLists }
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Sync WA groups — runs in background, survives page navigation
  const waSyncingRef = useRef(false)
  const waSyncAbortRef = useRef(null)
  const syncWaGroups = useCallback(async () => {
    if (waSyncingRef.current) return
    waSyncingRef.current = true
    waSyncAbortRef.current = new AbortController()
    setWaSyncing(true)
    setWaError(null)
    try {
      await authAPI.syncWhatsappGroups(waSyncAbortRef.current.signal)
      // Reload from DB after sync
      await loadWaGroups()
      window.dispatchEvent(new CustomEvent('possbo-wa-sync-done'))
    } catch (err) {
      if (err?.code === 'ERR_CANCELED') return // intentionally aborted
      logClientError('wa_groups_sync_failed', err, { source: 'DataProvider' })
      setWaError(err.userMessage || 'שגיאה בסנכרון')
    } finally {
      waSyncAbortRef.current = null
      waSyncingRef.current = false
      setWaSyncing(false)
    }
  }, [loadWaGroups])

  const cancelWaSync = useCallback(() => {
    if (waSyncAbortRef.current) waSyncAbortRef.current.abort()
  }, [])

  const clearWaQr = useCallback(() => setWaQrDataUrl(null), [])

  // Track previous connection state to detect new connections
  const prevWaConnectedRef = useRef(user?.whatsappSessionConnected)

  // Auto-sync WA when connection state changes to true (new connection)
  useEffect(() => {
    const wasConnected = prevWaConnectedRef.current
    const isConnected = user?.whatsappSessionConnected
    prevWaConnectedRef.current = isConnected

    if (!isConnected || !authVerifiedRef.current) return

    // Only a real false -> true transition means the user has just connected.
    // During initial auth hydration `wasConnected` is undefined, so no
    // unsolicited background sync should start.
    if (wasConnected === false) {
      // Just connected — wait for server auto-sync, then trigger full sync
      const timer = setTimeout(() => {
        syncWaGroups()
      }, 6000) // server auto-syncs groups at 5s, we sync at 6s
      return () => clearTimeout(timer)
    }

    // Already connected on page load — just load from DB if not loaded yet
    if (!waGroupsLoadedRef.current) {
      loadWaGroups()
    }
  }, [user?.whatsappSessionConnected, loadWaGroups, syncWaGroups])

  // Fetch all data - silent=true means background refresh (no loading state)
  const fetchAll = useCallback(async (silent = true) => {
    if (!userRef.current) return // Don't fetch if not authenticated

    // Increment version — any in-flight fetch with an older version will discard its results
    const version = ++fetchVersionRef.current

    // If another fetch is already running, let it continue but it will discard its stale results
    // because our version is now higher
    if (fetchInProgressRef.current && silent) return
    fetchInProgressRef.current = true

    setRefreshing(true)

    try {
      // Single combined request for ALL dashboard data (jobs, history, stats, campaigns, groups, templates)
      const dashRes = await groupsService.getDashboardData().catch(() => ({ data: {} }))

      // Only apply results if this is still the latest fetch
      if (fetchVersionRef.current !== version) return

      const d = dashRes.data
      setJobs(d.jobs || [])
      setCampaigns(d.campaigns || [])
      setGroups(d.groups || [])
      setPosts(d.history || [])
      setStats({ ...(d.stats || {}), topPosts: d.topPosts || [] })
      setTemplates(d.templates || [])
      setRecentCampaigns({ drafts: d.recentCampaigns?.drafts || [], history: d.recentCampaigns?.history || [] })
      lastFetchRef.current.all = Date.now()

    } catch {
      // silent
    } finally {
      setRefreshing(false)
      setDataReady(true)
      fetchInProgressRef.current = false
    }
  }, [])

  // Reconcile the persisted user flag with the live WhatsApp socket status.
  // This prevents different screens from showing conflicting connection states.
  useEffect(() => {
    if (!user || !authVerifiedRef.current || waStatusCheckedRef.current) return
    waStatusCheckedRef.current = true

    authAPI.getWhatsappStatus()
      .then((res) => {
        const connected = Boolean(res.data?.connected)
        const phone = res.data?.phone || null
        setUser((current) => current ? {
          ...current,
          whatsappSessionConnected: connected,
          whatsappSessionPhone: phone,
        } : current)
      })
      .catch(() => {
        waStatusCheckedRef.current = false
      })
  }, [user])

  const checkAuth = useCallback(async () => {
    // Skip refresh attempt if we have no cached user — a first-time visitor
    // won't have a refresh token cookie, so avoid the 401 console noise
    try {
      const refreshRes = await authAPI.refresh()
      // Use user data from refresh response if available (avoids extra getMe call)
      const userData = refreshRes?.data?.user
      if (userData) {
        setUser(userData)
        userRef.current = userData
        saveCachedUser(userData)
        setAuthChecked(true)
        authVerifiedRef.current = true
        // Start fetching data immediately — don't wait for React re-render
        fetchAll(true)
        return true
      }
      // Fallback: fetch user data separately
      const meRes = await authAPI.getMe()
      if (meRes?.data) {
        setUser(meRes.data)
        userRef.current = meRes.data
        saveCachedUser(meRes.data)
        setAuthChecked(true)
        authVerifiedRef.current = true
        // Start fetching data immediately
        fetchAll(true)
        return true
      }
    } catch { /* ignore */ }
    // Auth failed — clear cached user if we had one
    setUser(null)
    clearCachedUser()
    setAuthChecked(true)
    authVerifiedRef.current = true
    setDataReady(false)
    return false
  }, [fetchAll])

  // Check auth on mount (guard against Strict Mode double invocation)
  const authCheckStartedRef = useRef(false)
  useEffect(() => {
    if (authCheckStartedRef.current) return
    authCheckStartedRef.current = true
    checkAuth()
  }, [checkAuth])

  // Called after successful login/register — sets auth state and immediately fetches data
  const loginSuccess = useCallback((userData) => {
    // Clear stale data from previous user before fetching new data
    try { localStorage.removeItem(DATA_CACHE_KEY) } catch { /* ignore */ }
    setCampaigns([])
    setGroups([])
    setJobs([])
    setPosts([])
    setStats(null)
    setTemplates([])
    setRecentCampaigns({ drafts: [], history: [] })

    setUser(userData)
    userRef.current = userData
    saveCachedUser(userData)
    setAuthChecked(true)
    authVerifiedRef.current = true
    fetchAll(true)
  }, [fetchAll])

  const logout = useCallback(async () => {
    // Immediately clear refs to prevent any further API calls
    userRef.current = null
    authVerifiedRef.current = false
    fetchInProgressRef.current = false
    clearAccessToken()
    if (pollTimerRef.current) clearInterval(pollTimerRef.current)
    // Clear state — keep authChecked=true so AuthLayout redirects immediately
    setUser(null)
    setCampaigns([])
    setGroups([])
    setJobs([])
    setPosts([])
    setStats(null)
    setTemplates([])
    setRecentCampaigns({ drafts: [], history: [] })
    setDataReady(false)
    lastFetchRef.current = {}
    clearCachedUser()
    try { localStorage.removeItem(DATA_CACHE_KEY) } catch { /* ignore */ }
    try { localStorage.removeItem(WA_CONTACTS_CACHE_KEY) } catch { /* ignore */ }
    try { localStorage.removeItem(WA_BROADCASTS_CACHE_KEY) } catch { /* ignore */ }
    setWaGroups([])
    setWaBroadcastLists([])
    setWaSyncing(false)
    setWaQrDataUrl(null)
    setWaError(null)
    waGroupsLoadedRef.current = false
    waStatusCheckedRef.current = false
    // Fire-and-forget server logout — don't block UI
    authAPI.logout().catch(() => {})
  }, [])

  // Keep userRef in sync and persist to localStorage
  useEffect(() => {
    userRef.current = user
    if (user) saveCachedUser(user)
  }, [user])

  // Auto-fetch data when user becomes set through a path that doesn't call fetchAll directly
  // (e.g. setUser from a different source). Guarded by authVerifiedRef to prevent
  // premature API calls before checkAuth obtains a valid access token.
  useEffect(() => {
    if (user && authVerifiedRef.current && !lastFetchRef.current.all && !fetchInProgressRef.current) {
      userRef.current = user
      fetchAll(true)
    }
  }, [user, fetchAll])

  // ── Background polling: keep data fresh automatically ──
  useEffect(() => {
    if (!user) return

    // Poll for stale data every POLL_INTERVAL
    pollTimerRef.current = setInterval(() => {
      if (!userRef.current) return
      if (document.hidden) return // Don't poll when tab is hidden
      const last = lastFetchRef.current.all || 0
      if (Date.now() - last > CACHE_TTL) {
        fetchAll(true)
      }
    }, POLL_INTERVAL)

    // Listen for publish-done events to refresh immediately
    const handlePublishDone = () => {
      lastFetchRef.current = {}
      fetchAll(false) // non-silent: bypasses in-progress guard, version counter discards any stale in-flight results
    }
    window.addEventListener('possbo-publish-done', handlePublishDone)
    window.addEventListener('possbo-op-done', handlePublishDone)

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current)
      window.removeEventListener('possbo-publish-done', handlePublishDone)
      window.removeEventListener('possbo-op-done', handlePublishDone)
    }
  }, [user, fetchAll])

  // ── Visibility-based refresh: refresh when user comes back to tab ──
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) return
      if (!userRef.current) return
      const last = lastFetchRef.current.all || 0
      // If data is stale when tab becomes visible, refresh
      if (Date.now() - last > CACHE_TTL) {
        fetchAll(true)
      }
    }

    // Also refresh when network comes back online
    const handleOnline = () => {
      if (!userRef.current) return
      fetchAll(true)
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('online', handleOnline)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('online', handleOnline)
    }
  }, [fetchAll])

  // Refresh if data is stale (called on page navigation)
  const ensureFresh = useCallback(() => {
    if (!userRef.current || !authVerifiedRef.current) return
    const last = lastFetchRef.current.all || 0
    if (Date.now() - last > CACHE_TTL) {
      fetchAll(true)
    }
  }, [fetchAll])

  // Force refresh (pull-to-refresh / manual) - bypasses in-progress guard
  const forceRefresh = useCallback(() => {
    lastFetchRef.current = {}
    return fetchAll(false)
  }, [fetchAll])

  // Individual updaters for optimistic updates
  const updateGroups = useCallback((newGroups) => setGroups(newGroups), [])
  const updateCampaigns = useCallback((newCampaigns) => setCampaigns(newCampaigns), [])
  const updateCampaignEverywhere = useCallback((campaignId, changes) => {
    const patch = {
      ...changes,
      ...(changes.text !== undefined ? { content: changes.text } : {}),
    }
    delete patch.text

    setCampaigns(current => current.map(campaign => campaign.id === campaignId ? { ...campaign, ...patch } : campaign))
    setRecentCampaigns(current => ({
      drafts: (current?.drafts || []).map(campaign => campaign.id === campaignId ? { ...campaign, ...patch } : campaign),
      history: (current?.history || []).map(campaign => campaign.id === campaignId ? { ...campaign, ...patch } : campaign),
    }))
    setJobs(current => current.map(job => {
      const post = job.postGroup?.post
      if (post?.id !== campaignId && job.postId !== campaignId) return job
      return post
        ? { ...job, postGroup: { ...job.postGroup, post: { ...post, ...patch } } }
        : { ...job, ...patch }
    }))
    setPosts(current => current.map(publication => {
      if (publication.post?.id === campaignId) {
        return { ...publication, post: { ...publication.post, ...patch } }
      }
      if (publication.postId === campaignId) return { ...publication, ...patch }
      return publication
    }))
  }, [])

  const value = {
    // Auth
    user,
    setUser,
    authChecked,
    checkAuth,
    loginSuccess,
    logout,
    // Data
    campaigns,
    groups,
    jobs,
    posts,
    stats,
    templates,
    recentCampaigns,
    // Actions
    refreshing,
    dataReady,
    ensureFresh,
    forceRefresh,
    fetchAll,
    updateGroups,
    updateCampaigns,
    updateCampaignEverywhere,
    // Setters for specific updates
    setJobs,
    setCampaigns,
    setGroups,
    setPosts,
    setStats,
    setTemplates,
    setRecentCampaigns,
    // WhatsApp
    waGroups,
    waBroadcastLists,
    waSyncing,
    waQrDataUrl,
    waError,
    loadWaGroups,
    syncWaGroups,
    cancelWaSync,
    setWaBroadcastLists,
    clearWaQr,
  }

  return (
    <DataContext.Provider value={value}>
      {children}
    </DataContext.Provider>
  )
}

export function useAppData() {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useAppData must be used within DataProvider')
  return ctx
}
