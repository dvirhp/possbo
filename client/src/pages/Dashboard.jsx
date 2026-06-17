import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { groupsService } from '../services/groupsService'
import GenericList from '../components/GenericList'
import locale from '../assets/i18n'
import '../styles/dashboard.css'

export default function Dashboard() {
  const navigate = useNavigate()
  const [groups, setGroups] = useState([])
  const [loadingGroups, setLoadingGroups] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    const sessionReady = localStorage.getItem('fbSessionReady')
    if (!sessionReady) {
      navigate('/')
    }
  }, [navigate])

  const loadMyGroups = async () => {
    setLoadingGroups(true)
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
        localStorage.removeItem('fbSessionReady')
        navigate('/')
      } else {
        setError(`${locale.errors.generic} ${msg}`)
      }
    } finally {
      setLoadingGroups(false)
    }
  }

  const handleLogout = () => {
    localStorage.removeItem('fbSessionReady')
    navigate('/')
  }

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <div className="user-info">
          <h2>{locale.dashboard.title}</h2>
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
            onClick={loadMyGroups}
            disabled={loadingGroups}
            className="search-btn"
          >
            {loadingGroups ? `🔄 ${locale.dashboard.loadingGroups}` : `📋 ${locale.dashboard.loadGroups}`}
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

