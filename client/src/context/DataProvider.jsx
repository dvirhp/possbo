import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react'
import { authAPI } from '../services/api'
import { clearAccessToken } from '../services/http'
import { groupsService } from '../services/groupsService'

const DataContext = createContext(null)

// Cache TTL - data older than this will trigger a background refresh
const CACHE_TTL = 30_000 // 30 seconds
// Background polling interval (how often to check for stale data)
const POLL_INTERVAL = 20_000 // 20 seconds
// localStorage key for cached app data
const DATA_CACHE_KEY = 'postit_app_data'
const DATA_CACHE_TTL = 5 * 60 * 1000 // 5 minutes — show cached data instantly

// Load cached data from localStorage (runs synchronously at module level for speed)
function loadCachedData() {
  try {
    const raw = localStorage.getItem(DATA_CACHE_KEY)
    if (!raw) return null
    const cached = JSON.parse(raw)
    if (Date.now() - cached.ts > DATA_CACHE_TTL) return null
    return cached.data
  } catch { return null }
}

function saveCachedData(data) {
  try {
    localStorage.setItem(DATA_CACHE_KEY, JSON.stringify({ data, ts: Date.now() }))
  } catch { /* ignore quota errors */ }
}

// localStorage key for cached user (for instant auth-checked feel)
const USER_CACHE_KEY = 'postit_user'

function loadCachedUser() {
  try {
    const raw = localStorage.getItem(USER_CACHE_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch { return null }
}

function saveCachedUser(userData) {
  try {
    localStorage.setItem(USER_CACHE_KEY, JSON.stringify(userData))
  } catch { /* ignore */ }
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

      // Cache data for instant rendering on next page load
      saveCachedData({
        campaigns: d.campaigns || [],
        groups: d.groups || [],
        jobs: d.jobs || [],
        posts: d.history || [],
        stats: d.stats || null,
        templates: d.templates || [],
        recentCampaigns: { drafts: d.recentCampaigns?.drafts || [], history: d.recentCampaigns?.history || [] },
      })
    } catch {
      // silent
    } finally {
      setRefreshing(false)
      setDataReady(true)
      fetchInProgressRef.current = false
    }
  }, [])

  // Check auth on mount (guard against Strict Mode double invocation)
  const authCheckStartedRef = useRef(false)
  useEffect(() => {
    if (authCheckStartedRef.current) return
    authCheckStartedRef.current = true
    checkAuth()
  }, [])

  const checkAuth = useCallback(async () => {
    // Skip refresh attempt if we have no cached user — a first-time visitor
    // won't have a refresh token cookie, so avoid the 401 console noise
    if (!cachedUser) {
      setAuthChecked(true)
      authVerifiedRef.current = true
      return false
    }

    try {
      const refreshRes = await authAPI.refresh()
      console.log('[DataProvider] refresh response:', refreshRes?.data?.user?.instagramConnected, refreshRes?.data?.user?.instagramUsername)
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
    window.addEventListener('postit-publish-done', handlePublishDone)
    window.addEventListener('postit-op-done', handlePublishDone)

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current)
      window.removeEventListener('postit-publish-done', handlePublishDone)
      window.removeEventListener('postit-op-done', handlePublishDone)
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
    // Setters for specific updates
    setJobs,
    setCampaigns,
    setGroups,
    setPosts,
    setStats,
    setTemplates,
    setRecentCampaigns,
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
