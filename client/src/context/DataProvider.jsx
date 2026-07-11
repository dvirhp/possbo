import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react'
import { authAPI } from '../services/api'
import { groupsService } from '../services/groupsService'

const DataContext = createContext(null)

// Cache TTL - data older than this will trigger a background refresh
const CACHE_TTL = 30_000 // 30 seconds
// Background polling interval (how often to check for stale data)
const POLL_INTERVAL = 20_000 // 20 seconds

export function DataProvider({ children }) {
  // Auth state
  const [user, setUser] = useState(null)
  const [authChecked, setAuthChecked] = useState(false)

  // Data stores
  const [campaigns, setCampaigns] = useState([])
  const [groups, setGroups] = useState([])
  const [jobs, setJobs] = useState([])
  const [posts, setPosts] = useState([])
  const [stats, setStats] = useState(null)

  // Background refresh state
  const [refreshing, setRefreshing] = useState(false)
  const [dataReady, setDataReady] = useState(false)
  const lastFetchRef = useRef({})
  const fetchInProgressRef = useRef(false)
  const userRef = useRef(null)
  const pollTimerRef = useRef(null)

  // Check auth on mount
  useEffect(() => {
    checkAuth()
  }, [])

  const checkAuth = useCallback(async () => {
    try {
      await authAPI.refresh()
      const meRes = await authAPI.getMe()
      if (meRes?.data) {
        setUser(meRes.data)
        setAuthChecked(true)
        // Verify Facebook connection in background after login
        authAPI.verifyFacebook().then(verifyRes => {
          if (verifyRes?.data && typeof verifyRes.data.fbSessionValid === 'boolean') {
            setUser(prev => prev ? { ...prev, fbSessionValid: verifyRes.data.fbSessionValid } : prev)
          }
        }).catch(() => {})
        return true
      }
    } catch { /* ignore */ }
    setAuthChecked(true)
    return false
  }, [])

  const logout = useCallback(async () => {
    try { await authAPI.logout() } catch { /* ignore */ }
    setUser(null)
    setCampaigns([])
    setGroups([])
    setJobs([])
    setPosts([])
    setStats(null)
    lastFetchRef.current = {}
  }, [])

  // Keep userRef in sync
  useEffect(() => { userRef.current = user }, [user])

  // Fetch all data - silent=true means background refresh (no loading state)
  const fetchAll = useCallback(async (silent = true) => {
    if (fetchInProgressRef.current) return
    if (!userRef.current) return // Don't fetch if not authenticated
    fetchInProgressRef.current = true

    setRefreshing(true)

    try {
      const [jobsRes, groupsRes, historyRes, statsRes, campaignsRes] = await Promise.all([
        groupsService.getJobs().catch(() => ({ data: { jobs: [] } })),
        groupsService.getSavedGroups().catch(() => ({ data: { groups: [] } })),
        groupsService.getPublicationHistory().catch(() => ({ data: { history: [] } })),
        groupsService.getStats().catch(() => ({ data: { stats: null } })),
        groupsService.getCampaigns().catch(() => ({ data: { campaigns: [] } })),
      ])
      setJobs(jobsRes.data.jobs || [])
      setCampaigns(campaignsRes.data.campaigns || [])
      setGroups(groupsRes.data.groups || [])
      setPosts(historyRes.data.history || [])
      setStats(statsRes.data.stats || null)
      lastFetchRef.current.all = Date.now()
    } catch {
      // silent
    } finally {
      setRefreshing(false)
      setDataReady(true)
      fetchInProgressRef.current = false
    }
  }, [])

  // Auto-fetch data when user becomes set
  useEffect(() => {
    if (user && !lastFetchRef.current.all) {
      userRef.current = user // Ensure ref is up to date before fetchAll
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

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current)
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
        // Also refresh user info (fbSessionValid might have changed)
        authAPI.getMe().then(res => {
          if (res?.data) setUser(res.data)
        }).catch(() => {})
      }
    }

    // Also refresh when network comes back online
    const handleOnline = () => {
      if (!userRef.current) return
      fetchAll(true)
      authAPI.getMe().then(res => {
        if (res?.data) setUser(res.data)
      }).catch(() => {})
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
    if (!userRef.current) return
    const last = lastFetchRef.current.all || 0
    if (Date.now() - last > CACHE_TTL) {
      fetchAll(true)
      // Also refresh user info (fbSessionValid might have changed)
      authAPI.getMe().then(res => {
        if (res?.data) setUser(res.data)
      }).catch(() => {})
    }
  }, [fetchAll])

  // Force refresh (pull-to-refresh / manual) - bypasses in-progress guard
  const forceRefresh = useCallback(() => {
    fetchInProgressRef.current = false
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
    logout,
    // Data
    campaigns,
    groups,
    jobs,
    posts,
    stats,
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
