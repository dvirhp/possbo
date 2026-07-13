import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppData } from '../context/DataProvider'
import { templatesService } from '../services/templatesService'
import ConfirmDialog from '../components/ConfirmDialog'
import { Plus, Pencil, Trash2, Rocket, FileText, Calendar, Users, Search, LayoutGrid, List, Eye, MoreVertical } from 'lucide-react'
import '../styles/templates.css'

const API_HOST = 'http://localhost:5001'
const imgSrc = (url) => url?.startsWith('/uploads') ? `${API_HOST}${url}` : url

function formatNumber(n) {
  if (!n) return '0'
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M'
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K'
  return n.toString()
}

export default function Templates() {
  const navigate = useNavigate()
  const { user, authChecked, groups: cachedGroups } = useAppData()
  const [templates, setTemplates] = useState(() => {
    try {
      const cached = localStorage.getItem('postit_templates')
      return cached ? JSON.parse(cached) : []
    } catch { return [] }
  })
  const [loading, setLoading] = useState(() => {
    try { return !localStorage.getItem('postit_templates') } catch { return true }
  })
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [viewMode, setViewMode] = useState(() => window.innerWidth <= 768 ? 'grid' : 'grid')
  const [openMenuId, setOpenMenuId] = useState(null)
  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768

  // Close dropdown on outside click
  useEffect(() => {
    if (!openMenuId) return
    const close = () => setOpenMenuId(null)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [openMenuId])

  useEffect(() => {
    if (authChecked && !user) {
      navigate('/login')
      return
    }
    loadTemplates()
  }, [authChecked, user])

  const loadTemplates = async () => {
    try {
      const res = await templatesService.getAll()
      if (res.data.success) {
        setTemplates(res.data.templates)
        try { localStorage.setItem('postit_templates', JSON.stringify(res.data.templates)) } catch { /* ignore */ }
      }
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id) => {
    try {
      await templatesService.delete(id)
      setTemplates(prev => prev.filter(t => t.id !== id))
    } catch {
      // silent
    }
    setDeleteConfirm(null)
  }

  const handleUseTemplate = async (template) => {
    try {
      await templatesService.markUsed(template.id)
    } catch {
      // silent
    }
    navigate('/create-post', {
      state: {
        fromTemplate: {
          id: template.id,
          name: template.name,
          content: template.content,
          title: template.campaignTitle || '',
          isAnonymous: template.isAnonymous,
          location: template.location || '',
          scheduleMode: template.scheduleMode || 'now',
          recurringDays: template.recurringDays || [],
          recurringTimes: template.recurringTimes || [],
          dayTimes: template.dayTimes || {},
          groupIds: template.groupIds || [],
          imageUrls: template.imageUrls || [],
        }
      }
    })
  }

  const resolveGroups = (groupIds) => {
    if (!groupIds?.length || !cachedGroups?.length) return []
    return groupIds
      .map(id => cachedGroups.find(g => g.id === id))
      .filter(Boolean)
  }

  const getTotalReach = (groupIds) => {
    const resolved = resolveGroups(groupIds)
    return resolved.reduce((sum, g) => sum + (g.memberCount || 0), 0)
  }

  const scheduleModeLabel = (mode) => {
    if (mode === 'scheduled') return 'מתוזמן'
    if (mode === 'recurring') return 'חוזר'
    return 'מיידי'
  }

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return templates
    const q = searchQuery.toLowerCase()
    return templates.filter(t =>
      t.name.toLowerCase().includes(q) ||
      t.content.toLowerCase().includes(q) ||
      (t.campaignTitle && t.campaignTitle.toLowerCase().includes(q))
    )
  }, [templates, searchQuery])

  if (!authChecked || !user) return null

  return (
    <div className="templates-page">
      {/* Top Bar */}
      <div className="tpl-topbar">
        <h1 className="tpl-title">טמפלייטים</h1>
        <button className="tpl-create-btn" onClick={() => navigate('/templates/new')}>
          <Plus size={16} />
          <span>טמפלייט חדש</span>
        </button>
      </div>

      {/* Content */}
      <div className="tpl-content">
        {loading ? (
          <div className="tpl-loading">
            <div className="tpl-spinner" />
            <span>טוען טמפלייטים...</span>
          </div>
        ) : templates.length === 0 ? (
          <div className="tpl-empty">
            <div className="tpl-empty-icon">📋</div>
            <h2>אין טמפלייטים עדיין</h2>
            <p>צור טמפלייט כדי לחסוך זמן ביצירת קמפיינים חוזרים</p>
            <button className="tpl-empty-btn" onClick={() => navigate('/templates/new')}>
              <Plus size={16} />
              צור טמפלייט ראשון
            </button>
          </div>
        ) : (
          <>
            {/* Explanation bubble */}
            <div className="tpl-info-bubble">
              <span className="tpl-info-icon">💡</span>
              <div>
                <strong>מה זה טמפלייט?</strong>
                <p>טמפלייט הוא תבנית מוכנה לפוסט — כולל טקסט, תמונות, קבוצות ותזמון. במקום ליצור הכל מחדש כל פעם, שמרו טמפלייט ופרסמו בלחיצה אחת!</p>
              </div>
            </div>

            {/* Search + View Toggle Toolbar */}
            <div className="tpl-toolbar">
              <div className="tpl-search-wrap">
                <Search size={14} className="tpl-search-icon" />
                <input
                  type="text"
                  className="tpl-search-input"
                  placeholder="חפש טמפלייט..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
              </div>
              <span className="tpl-count">{filtered.length} טמפלייטים</span>
              <div className="tpl-view-toggle">
                <button
                  className={`tpl-view-btn ${viewMode === 'grid' ? 'active' : ''}`}
                  onClick={() => setViewMode('grid')}
                  title="תצוגת ריבועים"
                >
                  <LayoutGrid size={16} />
                </button>
                <button
                  className={`tpl-view-btn ${viewMode === 'list' ? 'active' : ''}`}
                  onClick={() => setViewMode('list')}
                  title="תצוגת שורות"
                >
                  <List size={16} />
                </button>
              </div>
            </div>

            {filtered.length === 0 ? (
              <div className="tpl-empty"><p>לא נמצאו טמפלייטים עבור "{searchQuery}"</p></div>
            ) : (viewMode === 'list' && !isMobile) ? (
              /* ═══ List View ═══ */
              <div className="tpl-list-table">
                <div className="tpl-list-header">
                  <span className="tpl-list-col tpl-list-col-name">שם</span>
                  <span className="tpl-list-col tpl-list-col-groups">קבוצות</span>
                  <span className="tpl-list-col tpl-list-col-reach">חשיפה</span>
                  <span className="tpl-list-col tpl-list-col-schedule">תזמון</span>
                  <span className="tpl-list-col tpl-list-col-usage">שימושים</span>
                  <span className="tpl-list-col tpl-list-col-actions"></span>
                </div>
                {filtered.map(tpl => {
                  const groups = resolveGroups(tpl.groupIds)
                  const reach = getTotalReach(tpl.groupIds)
                  return (
                    <div key={tpl.id} className="tpl-list-row">
                      <div className="tpl-list-col tpl-list-col-name">
                        <div className="tpl-list-icon"><FileText size={16} /></div>
                        <div className="tpl-list-name-wrap">
                          <span className="tpl-list-name">{tpl.name}</span>
                          <span className="tpl-list-subtitle">{tpl.content.length > 60 ? tpl.content.slice(0, 60) + '...' : tpl.content}</span>
                        </div>
                      </div>
                      <div className="tpl-list-col tpl-list-col-groups">
                        {groups.length > 0 ? (
                          <div className="tpl-list-group-avatars">
                            {groups.slice(0, 2).map((g, i) => (
                              <div key={i} className="tpl-list-group-dot" title={g.name}>
                                {g.pictureUrl ? <img src={g.pictureUrl} alt="" /> : <span>{g.name?.[0] || '?'}</span>}
                              </div>
                            ))}
                            {groups.length > 2 && <span className="tpl-list-group-more">+{groups.length - 2}</span>}
                          </div>
                        ) : <span className="tpl-list-muted">—</span>}
                      </div>
                      <div className="tpl-list-col tpl-list-col-reach">
                        <span className="tpl-list-reach">{reach > 0 ? formatNumber(reach) : '—'}</span>
                        {reach > 0 && <Eye size={13} className="tpl-list-reach-icon" />}
                      </div>
                      <div className="tpl-list-col tpl-list-col-schedule">
                        <span className="tpl-list-schedule-badge">{scheduleModeLabel(tpl.scheduleMode)}</span>
                      </div>
                      <div className="tpl-list-col tpl-list-col-usage">
                        <span>{tpl.usageCount}</span>
                      </div>
                      <div className="tpl-list-col tpl-list-col-actions">
                        <button className="tpl-list-use-btn" onClick={() => handleUseTemplate(tpl)}>
                          <Rocket size={13} /> צור קמפיין
                        </button>
                        <button className="tpl-action-btn tpl-edit" onClick={() => navigate(`/templates/${tpl.id}/edit`)} title="ערוך"><Pencil size={13} /></button>
                        <button className="tpl-action-btn tpl-delete" onClick={() => setDeleteConfirm(tpl)} title="מחק"><Trash2 size={13} /></button>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              /* ═══ Grid View ═══ */
              <div className="tpl-grid">
                {filtered.map(tpl => {
                  const groups = resolveGroups(tpl.groupIds)
                  const reach = getTotalReach(tpl.groupIds)
                  return (
                    <div key={tpl.id} className="tpl-card">
                      {/* Image Collage */}
                      {tpl.imageUrls?.length > 0 && (
                        <div className={`tpl-card-collage tpl-collage-${Math.min(tpl.imageUrls.length, 4)}`}>
                          {tpl.imageUrls.slice(0, 4).map((url, i) => (
                            <img key={i} src={imgSrc(url)} alt="" className="tpl-collage-img" />
                          ))}
                          {tpl.imageUrls.length > 4 && (
                            <span className="tpl-collage-more">+{tpl.imageUrls.length - 4}</span>
                          )}
                        </div>
                      )}

                      {/* Name + Content + Menu */}
                      <div className="tpl-card-body">
                        <div className="tpl-card-row">
                          <div className="tpl-card-info">
                            <h3 className="tpl-card-name">{tpl.name}</h3>
                            <p className="tpl-card-content">{tpl.content}</p>
                          </div>
                          <div className="tpl-card-menu-wrap">
                            <button
                              className="tpl-menu-btn"
                              onClick={e => { e.stopPropagation(); setOpenMenuId(openMenuId === tpl.id ? null : tpl.id) }}
                            >
                              <MoreVertical size={16} />
                            </button>
                            {openMenuId === tpl.id && (
                              <div className="tpl-card-dropdown">
                                <button onClick={() => { navigate(`/templates/${tpl.id}/edit`); setOpenMenuId(null) }}>
                                  <Pencil size={13} /> ערוך
                                </button>
                                <button className="tpl-dropdown-danger" onClick={() => { setDeleteConfirm(tpl); setOpenMenuId(null) }}>
                                  <Trash2 size={13} /> מחק
                                </button>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Meta tags */}
                        <div className="tpl-card-meta">
                          {groups.length > 0 && (
                            <span className="tpl-meta-tag">
                              <Users size={12} />
                              {groups.length} קבוצות
                            </span>
                          )}
                          {reach > 0 && (
                            <span className="tpl-meta-tag">
                              <Eye size={12} />
                              {formatNumber(reach)} חשיפה
                            </span>
                          )}
                          {tpl.scheduleMode && tpl.scheduleMode !== 'now' && (
                            <span className="tpl-meta-tag">
                              <Calendar size={12} />
                              {scheduleModeLabel(tpl.scheduleMode)}
                            </span>
                          )}
                          <span className="tpl-meta-tag tpl-meta-usage">
                            {tpl.usageCount} שימושים
                          </span>
                        </div>
                      </div>

                      {/* Use Template Button */}
                      <button className="tpl-use-btn" onClick={() => handleUseTemplate(tpl)}>
                        <Rocket size={16} />
                        <span>צור קמפיין מטמפלייט</span>
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>

      {/* Delete confirmation */}
      {deleteConfirm && (
        <ConfirmDialog
          title="מחיקת טמפלייט"
          message={`למחוק את הטמפלייט "${deleteConfirm.name}"?`}
          confirmLabel="מחק"
          cancelLabel="ביטול"
          variant="danger"
          onConfirm={() => handleDelete(deleteConfirm.id)}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}
    </div>
  )
}
