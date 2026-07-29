import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAppData } from '../context/DataProvider'
import { templatesService } from '../services/templatesService'
import ConfirmDialog from '../components/ConfirmDialog'
import BrandLogo from '../components/BrandLogo'
import { Plus, Pencil, Trash2, Rocket, FileText, Users, Search, LayoutGrid, List, Eye, MoreVertical, X, MapPin, UserX, ImageOff } from 'lucide-react'
import '../styles/templates.css'

const API_HOST = import.meta.env.VITE_API_ORIGIN || ''
const imgSrc = (url) => url?.startsWith('/uploads') ? `${API_HOST}${url}` : url
function formatNumber(n) {
  if (!n) return '0'
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M'
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K'
  return n.toString()
}

export default function Templates() {
  const navigate = useNavigate()
  const location = useLocation()
  const {
    user,
    authChecked,
    groups: cachedGroups,
    templates: cachedTemplates,
    setTemplates: setCachedTemplates,
    dataReady,
  } = useAppData()
  const [templates, setTemplates] = useState(() => cachedTemplates || [])
  const [loading, setLoading] = useState(() => !dataReady && !cachedTemplates?.length)
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [viewMode, setViewMode] = useState(() => window.innerWidth <= 768 ? 'grid' : 'grid')
  const [openMenuId, setOpenMenuId] = useState(null)
  const [activeTooltip, setActiveTooltip] = useState(null)
  const [selectedTemplate, setSelectedTemplate] = useState(null)
  const [detailMenuOpen, setDetailMenuOpen] = useState(false)
  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768

  // Close dropdown on outside click
  useEffect(() => {
    if (!openMenuId) return
    const close = () => setOpenMenuId(null)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [openMenuId])

  const loadTemplates = useCallback(async ({ showLoader = false } = {}) => {
    if (showLoader) setLoading(true)
    try {
      const res = await templatesService.getAll()
      if (res.data.success) {
        const nextTemplates = res.data.templates || []
        setTemplates(nextTemplates)
        setCachedTemplates(nextTemplates)
      }
    } catch {
      // Keep the cached list visible when a background refresh fails.
    } finally {
      setLoading(false)
    }
  }, [setCachedTemplates])

  useEffect(() => {
    if (authChecked && !user) {
      navigate('/login')
      return
    }
    if (!authChecked || !user) return
    // Dashboard data already contains templates. Show it immediately and
    // refresh silently so navigating to this page never blocks on the network.
    loadTemplates({ showLoader: !dataReady && templates.length === 0 })
  }, [authChecked, user, location.key]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!cachedTemplates) return
    setTemplates(cachedTemplates)
    if (dataReady) setLoading(false)
  }, [cachedTemplates, dataReady])

  // Reload templates when publish completes in background
  useEffect(() => {
    const handlePublishDone = () => { loadTemplates() }
    window.addEventListener('possbo-publish-done', handlePublishDone)
    return () => {
      window.removeEventListener('possbo-publish-done', handlePublishDone)
    }
  }, [loadTemplates])

  const handleDelete = async (id) => {
    try {
      await templatesService.delete(id)
      setTemplates(prev => prev.filter(t => t.id !== id))
      setCachedTemplates(prev => prev.filter(t => t.id !== id))
    } catch {
      // silent
    }
    setDeleteConfirm(null)
  }

  const handleUseTemplate = async (template) => {
    navigate('/create-post', {
      state: {
        fromTemplate: {
          id: template.id,
          name: template.name,
          content: template.content,
          title: template.campaignTitle || '',
          isAnonymous: template.isAnonymous,
          location: template.location || '',
          groupIds: template.groupIds || [],
           imageUrls: template.imageUrls || [],
           whatsappText: template.whatsappText || null,
           whatsappEnabled: !!template.whatsappEnabled,
           whatsappTargets: template.whatsappTargets || [],
         }
      }
    })
  }

  const resolveGroups = (groupIds) => {
    if (!groupIds?.length || !cachedGroups?.length) return []
    return groupIds
      .map(id => cachedGroups.find(g => g.id === id || g.externalId === id || g.url?.includes(`/groups/${id}`)))
      .filter(Boolean)
  }

  const getTotalReach = (groupIds) => {
    const resolved = resolveGroups(groupIds)
    return resolved.reduce((sum, g) => sum + (g.memberCount || 0), 0)
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
            <BrandLogo decorative className="loader-logo-pulse" />
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
                <p>טמפלייט הוא תבנית מוכנה לפוסט, כולל טקסט, תמונות ויעדי פרסום. במקום ליצור הכול מחדש בכל פעם, שמרו טמפלייט והשתמשו בו ליצירת קמפיין חדש.</p>
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
                  className="tpl-view-btn active"
                  onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
                  title={viewMode === 'grid' ? 'תצוגת שורות' : 'תצוגת ריבועים'}
                >
                  {viewMode === 'grid' ? <List size={16} /> : <LayoutGrid size={16} />}
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
                  <span className="tpl-list-col tpl-list-col-usage">שימושים</span>
                  <span className="tpl-list-col tpl-list-col-actions"></span>
                </div>
                {filtered.map(tpl => {
                  const groups = resolveGroups(tpl.groupIds)
                  const reach = tpl.totalReach ?? getTotalReach(tpl.groupIds)
                  return (
                    <div key={tpl.id} className="tpl-list-row" onClick={() => { setSelectedTemplate(tpl); setDetailMenuOpen(false) }} style={{ cursor: 'pointer' }}>
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
                      <div className="tpl-list-col tpl-list-col-usage">
                        <span>{tpl.usageCount}</span>
                      </div>
                      <div className="tpl-list-col tpl-list-col-actions" onClick={e => e.stopPropagation()}>
                        <button className="tpl-list-use-btn" onClick={() => handleUseTemplate(tpl)}>
                          <Rocket size={13} /> צור קמפיין
                        </button>
                        <button className="tpl-action-btn tpl-edit" onClick={() => navigate(`/templates/${tpl.id}/edit`)} title="ערוך" aria-label={`ערוך טמפלייט ${tpl.name}`}><Pencil size={13} /></button>
                        <button className="tpl-action-btn tpl-delete" onClick={() => setDeleteConfirm(tpl)} title="מחק" aria-label={`מחק טמפלייט ${tpl.name}`}><Trash2 size={13} /></button>
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
                  const groupCount = tpl.groupIds?.length || 0
                  const reach = tpl.totalReach ?? getTotalReach(tpl.groupIds)
                  return (
                    <div key={tpl.id} className="tpl-card" onClick={() => { setSelectedTemplate(tpl); setDetailMenuOpen(false) }} style={{ cursor: 'pointer' }}>
                      {/* Image Collage */}
                      {tpl.imageUrls?.length > 0 ? (
                        <div className={`tpl-card-collage tpl-collage-${Math.min(tpl.imageUrls.length, 4)}`}>
                          {tpl.imageUrls.slice(0, 4).map((url, i) => (
                            <img key={i} src={imgSrc(url)} alt="" className="tpl-collage-img" />
                          ))}
                          {tpl.imageUrls.length > 4 && (
                            <span className="tpl-collage-more">+{tpl.imageUrls.length - 4}</span>
                          )}
                        </div>
                      ) : (
                        <div className="tpl-card-collage tpl-card-image-placeholder" aria-label="אין תמונה לטמפלייט">
                          <ImageOff size={30} strokeWidth={1.6} aria-hidden="true" />
                          <span>אין תמונה</span>
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
                          {groupCount > 0 && (
                            <span
                              className="tpl-meta-tag"
                              onMouseEnter={() => setActiveTooltip(`groups-${tpl.id}`)}
                              onMouseLeave={() => setActiveTooltip(null)}
                              onClick={(e) => { e.stopPropagation(); setActiveTooltip(activeTooltip === `groups-${tpl.id}` ? null : `groups-${tpl.id}`) }}
                            >
                              <Users size={12} />
                              {groupCount} קבוצות
                              {activeTooltip === `groups-${tpl.id}` && groups.length > 0 && (
                                <span className="tpl-tooltip">{groups.map(g => g.name).join('\n')}</span>
                              )}
                            </span>
                          )}
                          {(reach > 0 || groupCount > 0) && (
                            <span
                              className="tpl-meta-tag"
                              onMouseEnter={() => setActiveTooltip(`reach-${tpl.id}`)}
                              onMouseLeave={() => setActiveTooltip(null)}
                              onClick={(e) => { e.stopPropagation(); setActiveTooltip(activeTooltip === `reach-${tpl.id}` ? null : `reach-${tpl.id}`) }}
                            >
                              <Eye size={12} />
                              {formatNumber(reach)} חשיפה
                              {activeTooltip === `reach-${tpl.id}` && groups.length > 0 && (
                                <span className="tpl-tooltip">{groups.map(g => `${g.name}: ${formatNumber(g.memberCount || 0)}`).join('\n')}</span>
                              )}
                            </span>
                          )}
                          <span
                            className="tpl-meta-tag"
                            onMouseEnter={() => setActiveTooltip(`usage-${tpl.id}`)}
                            onMouseLeave={() => setActiveTooltip(null)}
                            onClick={(e) => { e.stopPropagation(); setActiveTooltip(activeTooltip === `usage-${tpl.id}` ? null : `usage-${tpl.id}`) }}
                          >
                            {tpl.usageCount} שימושים
                            {activeTooltip === `usage-${tpl.id}` && (
                              <span className="tpl-tooltip">שימוש {tpl.usageCount} פעמים בפרסום</span>
                            )}
                          </span>
                        </div>
                      </div>

                      {/* Use Template Button */}
                      <button className="tpl-use-btn" onClick={(e) => { e.stopPropagation(); handleUseTemplate(tpl) }}>
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

      {/* Template Detail Popup */}
      {selectedTemplate && (() => {
        const tpl = selectedTemplate
        const groups = resolveGroups(tpl.groupIds)
        const reach = tpl.totalReach ?? getTotalReach(tpl.groupIds)
        return (
          <div className="tpl-detail-overlay" onClick={() => setSelectedTemplate(null)}>
            <div className="tpl-detail-modal" onClick={e => e.stopPropagation()}>
              {/* Header */}
              <div className="tpl-detail-header">
                <button className="tpl-detail-close" onClick={() => setSelectedTemplate(null)} aria-label="סגור פרטי טמפלייט"><X size={18} /></button>
                <h3>{tpl.name}</h3>
                <div className="tpl-detail-menu-wrap">
                  <button className="tpl-detail-menu-btn" onClick={() => setDetailMenuOpen(!detailMenuOpen)} aria-label="פתח תפריט פעולות" aria-haspopup="menu" aria-expanded={detailMenuOpen}>
                    <MoreVertical size={18} />
                  </button>
                  {detailMenuOpen && (
                    <div className="tpl-detail-dropdown">
                      <button onClick={() => { setSelectedTemplate(null); setDetailMenuOpen(false); navigate(`/templates/${tpl.id}/edit`) }}>
                        <Pencil size={14} /> ערוך טמפלייט
                      </button>
                      <button className="tpl-dropdown-danger" onClick={() => { setSelectedTemplate(null); setDetailMenuOpen(false); setDeleteConfirm(tpl) }}>
                        <Trash2 size={14} /> מחק טמפלייט
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Images */}
              {tpl.imageUrls?.length > 0 && (
                <div className="tpl-detail-images">
                  {tpl.imageUrls.length === 1 ? (
                    <img src={imgSrc(tpl.imageUrls[0])} alt="" className="tpl-detail-img-single" />
                  ) : (
                    <div className={`tpl-detail-img-grid tpl-detail-grid-${Math.min(tpl.imageUrls.length, 4)}`}>
                      {tpl.imageUrls.slice(0, 4).map((url, i) => (
                        <img key={i} src={imgSrc(url)} alt="" />
                      ))}
                      {tpl.imageUrls.length > 4 && (
                        <span className="tpl-detail-img-more">+{tpl.imageUrls.length - 4}</span>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Body */}
              <div className="tpl-detail-body">
                {/* Campaign title */}
                {tpl.campaignTitle && (
                  <div className="tpl-detail-field">
                    <span className="tpl-detail-label">כותרת קמפיין</span>
                    <span className="tpl-detail-value">{tpl.campaignTitle}</span>
                  </div>
                )}

                {/* Content */}
                <div className="tpl-detail-field">
                  <span className="tpl-detail-label">תוכן הפוסט</span>
                  <div className="tpl-detail-content">{tpl.content}</div>
                </div>

                {/* Groups */}
                {groups.length > 0 && (
                  <div className="tpl-detail-field">
                    <span className="tpl-detail-label"><Users size={14} /> קבוצות ({groups.length})</span>
                    <div className="tpl-detail-groups-list">
                      {groups.map(g => (
                        <div key={g.id} className="tpl-detail-group-row">
                          {g.pictureUrl ? <img src={g.pictureUrl} alt="" className="tpl-detail-group-img" /> : <span className="tpl-detail-group-letter">{g.name?.[0]}</span>}
                          <span className="tpl-detail-group-name">{g.name}</span>
                          {g.memberCount > 0 && <span className="tpl-detail-group-count">{formatNumber(g.memberCount)}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Exposure */}
                {reach > 0 && (
                  <div className="tpl-detail-field">
                    <span className="tpl-detail-label"><Eye size={14} /> חשיפה משוערת</span>
                    <span className="tpl-detail-value tpl-detail-highlight">{formatNumber(reach)}</span>
                  </div>
                )}

                {/* Anonymous */}
                {tpl.isAnonymous && (
                  <div className="tpl-detail-field">
                    <span className="tpl-detail-label"><UserX size={14} /> פרסום אנונימי</span>
                    <span className="tpl-detail-value">כן</span>
                  </div>
                )}

                {/* Location */}
                {tpl.location && (
                  <div className="tpl-detail-field">
                    <span className="tpl-detail-label"><MapPin size={14} /> מיקום</span>
                    <span className="tpl-detail-value">{tpl.location}</span>
                  </div>
                )}

                {/* Usage count */}
                <div className="tpl-detail-field">
                  <span className="tpl-detail-label"><Rocket size={14} /> שימושים</span>
                  <span className="tpl-detail-value">{tpl.usageCount || 0} פעמים</span>
                </div>
              </div>

              {/* Footer action */}
              <div className="tpl-detail-footer">
                <button className="tpl-detail-use-btn" onClick={() => { setSelectedTemplate(null); handleUseTemplate(tpl) }}>
                  <Rocket size={16} />
                  צור קמפיין מטמפלייט
                </button>
              </div>
            </div>
          </div>
        )
      })()}

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
