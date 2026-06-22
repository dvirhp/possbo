import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react'
import { authAPI } from '../services/api'
import { groupsService } from '../services/groupsService'

const DataContext = createContext(null)

// Cache TTL - data older than this will trigger a background refresh
const CACHE_TTL = 60_000 // 60 seconds

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
  const lastFetchRef = useRef({})
  const fetchInProgressRef = useRef(false)

  // Check auth on mount
  useEffect(() => {
    checkAuth()
  }, [])

  const checkAuth = useCallback(async () => {
    try {
      const [, meRes] = await Promise.all([
        authAPI.refresh(),
        authAPI.getMe().catch(() => null),
      ])
      if (meRes?.data) {
        setUser(meRes.data)
        setAuthChecked(true)
        // Load data after auth
        fetchAll(false)
        return true
      }
    } catch {}
    setAuthChecked(true)
    return false
  }, [])

  const logout = useCallback(async () => {
    try { await authAPI.logout() } catch {}
    setUser(null)
    setCampaigns([])
    setGroups([])
    setJobs([])
    setPosts([])
    setStats(null)
    lastFetchRef.current = {}
  }, [])

  // Fetch all data - silent=true means background refresh (no loading state)
  const fetchAll = useCallback(async (silent = true) => {
    if (fetchInProgressRef.current) return
    fetchInProgressRef.current = true

    if (!silent) setRefreshing(true)
    else setRefreshing(true) // always show subtle indicator

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
      fetchInProgressRef.current = false
    }
  }, [])

  // Refresh if data is stale (called on page navigation)
  const ensureFresh = useCallback(() => {
    const last = lastFetchRef.current.all || 0
    if (Date.now() - last > CACHE_TTL) {
      fetchAll(true)
    }
  }, [fetchAll])

  // Force refresh (pull-to-refresh / manual)
  const forceRefresh = useCallback(() => {
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
