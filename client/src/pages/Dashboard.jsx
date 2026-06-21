import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { authAPI } from '../services/api'
import { groupsService } from '../services/groupsService'
import '../styles/dashboard.css'

export default function Dashboard() {
  const navigate = useNavigate()
  const [user, setUser] = useState(null)
  const [recentPosts, setRecentPosts] = useState([])
  const [loadingPosts, setLoadingPosts] = useState(true)

  useEffect(() => {
    const init = async () => {
      try {
        // Load auth + posts in parallel for instant page feel
        const [, meRes] = await Promise.all([
          authAPI.refresh(),
          authAPI.getMe().catch(() => null),
        ])
        if (!meRes?.data) throw new Error('not logged in')
        setUser(meRes.data)
      } catch {
        navigate('/login')
        return
      }
      loadRecentPosts()
    }
    init()
  }, [navigate])

  const loadRecentPosts = async () => {
    setLoadingPosts(true)
    try {
      const res = await groupsService.getPublicationHistory()
      if (res.data.success) {
        setRecentPosts(res.data.history || [])
      }
    } catch {
      // silent
    } finally {
      setLoadingPosts(false)
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
          <Link to="/" className="dashboard-logo">📌 PostIt</Link>
          {user && <span className="user-name">👤 {user.name || user.email}</span>}
        </div>
        <button onClick={handleLogout} className="logout-btn">התנתק</button>
      </div>

      <div className="dashboard-content">
        <div className="dashboard-actions">
          <Link to="/create-post" className="action-card action-create">
            <span className="action-icon">✍️</span>
            <span className="action-text">צור פוסט חדש</span>
          </Link>
          <Link to="/my-groups" className="action-card action-groups">
            <span className="action-icon">👥</span>
            <span className="action-text">הקבוצות שלי</span>
          </Link>
        </div>

        <div className="recent-posts-section">
          <h3>📋 פרסומים אחרונים</h3>
          {loadingPosts && <p className="loading-text">טוען...</p>}
          {!loadingPosts && recentPosts.length === 0 && (
            <div className="empty-state">
              <p>עדיין לא פרסמת פוסטים.</p>
              <Link to="/create-post" className="empty-cta">צור את הפוסט הראשון שלך →</Link>
            </div>
          )}
          {recentPosts.length > 0 && (
            <div className="posts-list">
              {recentPosts.map((item) => (
                <div
                  key={item.id}
                  className={`post-item post-${item.status?.toLowerCase()} clickable`}
                  onClick={() => navigate(`/post/${item.id}`)}
                >
                  <div className="post-item-header">
                    <span className="post-group-name">{item.group?.name || 'קבוצה'}</span>
                    <span className={`post-status ${item.status?.toLowerCase()}`}>
                      {item.status === 'SUCCESS' ? '✓ פורסם' : item.status === 'FAILED' ? '✗ נכשל' : '⏳ ממתין'}
                    </span>
                  </div>
                  <p className="post-content-preview">
                    {item.post?.content?.slice(0, 80) || '—'}
                    {item.post?.content?.length > 80 ? '...' : ''}
                  </p>
                  <span className="post-date">
                    {item.publishedAt ? new Date(item.publishedAt).toLocaleDateString('he-IL') : ''}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

