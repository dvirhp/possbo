import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { authAPI } from '../services/api'
import { groupsService } from '../services/groupsService'
import GenericList from '../components/GenericList'
import BackButton from '../components/BackButton'
import '../styles/my-groups.css'

export default function MyGroups() {
  const navigate = useNavigate()
  const [groups, setGroups] = useState([])
  const [loadingGroups, setLoadingGroups] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    const init = async () => {
      try {
        await authAPI.refresh()
      } catch {
        navigate('/login')
        return
      }
      loadSavedGroups()
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
      // silent
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
        setError('לא נמצאו קבוצות')
      }
    } catch (err) {
      const msg = err.response?.data?.error || err.message
      if (msg === 'FACEBOOK_SESSION_REQUIRED') {
        setError('נדרש חיבור לפייסבוק. אנא התחבר מחדש.')
      } else {
        setError(`שגיאה: ${msg}`)
      }
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <div className="my-groups-page">
      <div className="page-header">
        <BackButton />
        <h2>👥 הקבוצות שלי</h2>
      </div>

      <div className="groups-actions">
        <button
          onClick={refreshGroups}
          disabled={refreshing || loadingGroups}
          className="refresh-btn"
        >
          {refreshing ? '🔄 טוען קבוצות...' : groups.length > 0 ? '🔄 רענן קבוצות' : '📋 טען את הקבוצות שלי'}
        </button>
      </div>

      {error && <div className="error-message">{error}</div>}

      <GenericList
        items={groups}
        basePath="/group"
        title={groups.length > 0 ? `נמצאו ${groups.length} קבוצות:` : null}
      />
    </div>
  )
}
