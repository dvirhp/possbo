import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { authAPI } from '../services/api'
import { groupsService } from '../services/groupsService'
import GenericList from '../components/GenericList'
import locale from '../assets/i18n'
import '../styles/dashboard.css'

export default function Dashboard() {
  const navigate = useNavigate()
  const [user, setUser] = useState(null)
  const [groups, setGroups] = useState([])
  const [loadingGroups, setLoadingGroups] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    // On page load, try to refresh token from cookie, then get user
    const init = async () => {
      try {
        await authAPI.refresh()
        const res = await authAPI.getMe()
        setUser(res.data)
        loadSavedGroups()
      } catch {
        navigate('/')
      }
    }
    init()
  }, [navigate])

  const loadSavedGroups = async () => {
    setLoadingGroups(true)
    setError(null)
    try {
      const res = await groupsService.getSavedGroups()
      if (res.data.success && res.data.groups?.length > 0) {
        setGroups(res.data.groups)
      }
    } catch {
      // Silent - will show empty state with load button
    } finally {
      setLoadingGroups(false)
    }
  }

  const refreshGroups = async () => {
    setRefreshing(true)
    setError(null)
    try {
      const res = await groupsService.scrapeMyGroups()
      if (res.data.success && res.data.groups) {
        setGroups(res.data.groups)
      } else {
        setError(locale.dashboard.noGroupsFound)
      }
    } catch (err) {
      const msg = err.response?.data?.error || err.message
      if (msg === 'FACEBOOK_SESSION_REQUIRED') {
        setError(locale.errors.fbSessionRequired)
      } else {
        setError(`${locale.errors.generic} ${msg}`)
      }
    } finally {
      setRefreshing(false)
    }
  }

  const handleLogout = async () => {
    try {
      await authAPI.logout()
    } catch {
      // silent
    }
    navigate('/')
  }

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <div className="user-info">
          <h2>{locale.dashboard.title}</h2>
          {user && <span className="user-name">👤 {user.name || user.email}</span>}
        </div>
        <button onClick={handleLogout} className="logout-btn">
          {locale.logout}
        </button>
      </div>

      <div className="dashboard-content">
        <div className="groups-section">
          <h3>👥 {locale.dashboard.myGroups}</h3>
          <p>{locale.dashboard.description}</p>

          <button
            onClick={refreshGroups}
            disabled={refreshing || loadingGroups}
            className="search-btn"
          >
            {refreshing ? `🔄 ${locale.dashboard.loadingGroups}` : groups.length > 0 ? `🔄 ${locale.dashboard.refreshGroups}` : `📋 ${locale.dashboard.loadGroups}`}
          </button>

          {error && <div className="error-message">{error}</div>}

          <GenericList
            items={groups}
            basePath="/group"
            title={groups.length > 0 ? locale.dashboard.groupsFound(groups.length) : null}
          />
        </div>
      </div>
    </div>
  )
}

