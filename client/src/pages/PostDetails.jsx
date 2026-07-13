import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { authAPI } from '../services/api'
import { groupsService } from '../services/groupsService'
import BackButton from '../components/BackButton'
import '../styles/post-details.css'

export default function PostDetails() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [publication, setPublication] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const init = async () => {
      try {
        await authAPI.refresh()
        const res = await groupsService.getPublication(id)
        if (res.data.success) {
          setPublication(res.data.publication)
        }
      } catch {
        navigate('/login')
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [id, navigate])

  const handleRepublish = () => {
    if (!publication) return
    navigate('/create-post', {
      state: {
        republish: {
          content: publication.post?.content || '',
          title: publication.post?.title || '',
          isAnonymous: publication.post?.isAnonymous || false,
          location: publication.post?.location || '',
        }
      }
    })
  }

  if (loading) {
    return (
      <div className="post-details-page">
        <div className="page-header">
          <BackButton />
        </div>
        <p className="loading-text">טוען...</p>
      </div>
    )
  }

  if (!publication) {
    return (
      <div className="post-details-page">
        <div className="page-header">
          <BackButton />
          <h2>פרסום לא נמצא</h2>
        </div>
      </div>
    )
  }

  return (
    <div className="post-details-page">
      <div className="page-header">
        <BackButton />
        <h2>📄 פרטי הפרסום</h2>
      </div>

      <div className="post-detail-card">
        <div className="post-detail-meta">
          <span className="post-detail-group">
            👥 {publication.group?.name || 'קבוצה'}
          </span>
          <span className={`post-detail-status ${publication.status?.toLowerCase()}`}>
            {publication.status === 'SUCCESS' ? '✓ פורסם בהצלחה' : publication.status === 'FAILED' ? '✗ נכשל' : '⏳ ממתין'}
          </span>
        </div>

        {publication.publishedAt && (
          <div className="post-detail-date">
            🕐 {new Date(publication.publishedAt).toLocaleString('he-IL')}
          </div>
        )}

        <div className="post-detail-content">
          <h4>תוכן הפוסט:</h4>
          <p>{publication.post?.content || ''}</p>
        </div>

        {publication.post?.location && (
          <div className="post-detail-location">
            📍 {publication.post.location}
          </div>
        )}

        {publication.postUrl && (
          <a
            href={publication.postUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="post-detail-link"
          >
            🔗 צפה בפוסט בפייסבוק
          </a>
        )}
      </div>

      <div className="post-detail-actions">
        <button className="republish-btn" onClick={handleRepublish}>
          🔄 פרסם מחדש
        </button>
      </div>
    </div>
  )
}
