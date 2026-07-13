import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Clock3, CheckCircle2, CircleAlert, FileEdit, MoreVertical, Image, Calendar } from 'lucide-react'
import { groupsService } from '../services/groupsService'

const STATUS_CONFIG = {
  active: { label: 'פעיל', color: '#60A5FA', bg: 'rgba(59,130,246,0.15)', border: '#3B82F6', Icon: CheckCircle2 },
  scheduled: { label: 'מתוזמן', color: '#60A5FA', bg: 'rgba(59,130,246,0.15)', border: '#3B82F6', Icon: Clock3 },
  recurring: { label: 'חוזר', color: '#A78BFA', bg: 'rgba(139,92,246,0.15)', border: '#8B5CF6', Icon: Clock3 },
  draft: { label: 'טיוטה', color: '#E5E7EB', bg: '#374151', border: '#374151', Icon: FileEdit },
  published: { label: 'פורסם', color: '#4ADE80', bg: 'rgba(34,197,94,0.15)', border: '#22C55E', Icon: CheckCircle2 },
  paused: { label: 'מושהה', color: '#F59E0B', bg: 'rgba(245,158,11,0.15)', border: '#F59E0B', Icon: CircleAlert },
  failed: { label: 'נכשל', color: '#F87171', bg: 'rgba(239,68,68,0.15)', border: '#EF4444', Icon: CircleAlert },
  'one-time': { label: 'חד פעמי', color: '#60A5FA', bg: 'rgba(59,130,246,0.15)', border: '#3B82F6', Icon: CheckCircle2 },
}

const BORDER_COLORS = {
  active: '#3B82F6',
  scheduled: '#3B82F6',
  recurring: '#8B5CF6',
  draft: '#64748B',
  published: '#22C55E',
  paused: '#F59E0B',
  failed: '#EF4444',
  'one-time': '#3B82F6',
}

function formatDate(dateStr) {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  const day = d.getDate()
  const months = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר']
  const month = months[d.getMonth()]
  const time = d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
  return { date: `${day} ${month}`, time }
}

export default function PostsDataTable({ campaigns, onUpdate, onViewCampaign }) {
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)

  const handleRowClick = (campaign) => {
    if (onViewCampaign) {
      onViewCampaign(campaign)
    } else {
      navigate(`/post/${campaign.id}`)
    }
  }

  const handleEdit = (campaign) => {
    setMenuOpen(null)
    if (onViewCampaign) {
      onViewCampaign(campaign, true)
    } else {
      navigate(`/post/${campaign.id}`)
    }
  }

  const handleDuplicate = async (campaign) => {
    setMenuOpen(null)
    try {
      await groupsService.duplicateCampaign(campaign.id)
      if (onUpdate) onUpdate()
    } catch { /* ignore */ }
  }

  const handleDelete = async (campaign) => {
    setMenuOpen(null)
    setConfirmDelete(campaign)
  }

  const confirmDeleteAction = async () => {
    if (!confirmDelete) return
    try {
      await groupsService.deleteCampaign(confirmDelete.id)
      if (onUpdate) onUpdate()
    } catch { /* ignore */ }
    setConfirmDelete(null)
  }

  if (!campaigns || campaigns.length === 0) {
    return (
      <div className="pdt-empty">
        <p>אין פוסטים להצגה</p>
      </div>
    )
  }

  return (
    <div className="pdt-container">
      {/* Table Header */}
      <div className="pdt-header">
        <span className="pdt-col pdt-col-post">פוסט</span>
        <span className="pdt-col pdt-col-groups">קבוצות</span>
        <span className="pdt-col pdt-col-status">סטטוס</span>
        <span className="pdt-col pdt-col-time">זמן מתוזמן</span>
        <span className="pdt-col pdt-col-actions"></span>
      </div>

      {/* Table Rows */}
      <div className="pdt-body">
        {campaigns.map(campaign => {
          const status = (campaign.status || 'draft').toLowerCase()
          const type = (campaign.campaignType || '').toLowerCase()
          const statusKey = type === 'recurring' ? 'recurring' : type === 'one-time' ? 'one-time' : status
          const statusConf = STATUS_CONFIG[statusKey] || STATUS_CONFIG[status] || STATUS_CONFIG.draft
          const borderColor = BORDER_COLORS[statusKey] || BORDER_COLORS[status] || '#64748B'
          const StatusIcon = statusConf.Icon
          const title = campaign.title || campaign.content?.substring(0, 40) || 'ללא כותרת'
          const subtitle = campaign.content?.substring(0, 60) || ''
          const image = campaign.imageUrl || null
          const groupCount = campaign.groupCount || campaign.groups?.length || 0
          const groups = campaign.groups || []
          const nextRun = formatDate(campaign.createdAt)

          return (
            <div
              key={campaign.id}
              className="pdt-row"
              onClick={() => handleRowClick(campaign)}
            >
              {/* Post column */}
              <div className="pdt-col pdt-col-post">
                <div className="pdt-thumb">
                  {image ? <img src={image.startsWith('http') ? image : `http://localhost:5001${image}`} alt="" onError={e => e.target.style.display='none'} /> : <div className="pdt-thumb-placeholder"><Image size={20} /></div>}
                </div>
                <div className="pdt-post-info">
                  <span className="pdt-post-title">{title}</span>
                  {subtitle && subtitle !== title && (
                    <span className="pdt-post-subtitle">{subtitle.length > 50 ? subtitle.slice(0, 50) + '...' : subtitle}</span>
                  )}
                  <div className="pdt-post-tags">
                    {image && <span className="pdt-tag"><Image size={12} /> תמונה</span>}
                    {(status === 'ACTIVE' || status === 'RECURRING') && <span className="pdt-tag"><Calendar size={12} /> מתוזמן</span>}
                  </div>
                </div>
              </div>

              {/* Groups column */}
              <div className="pdt-col pdt-col-groups">
                <div className="pdt-group-avatars">
                  {campaign.publishToProfile && (
                    <div className="pdt-group-avatar pdt-profile-badge" title="פרופיל אישי">
                      <span>👤</span>
                    </div>
                  )}
                  {groups.slice(0, 2).map((g, i) => (
                    <div key={i} className="pdt-group-avatar" title={g.name}>
                      {g.pictureUrl || g.image ? (
                        <img src={g.pictureUrl || g.image} alt="" onError={e => { e.target.style.display='none'; e.target.nextSibling && (e.target.nextSibling.style.display='flex') }} />
                      ) : null}
                      <span style={g.pictureUrl || g.image ? { display: 'none' } : {}}>{g.name?.[0] || '?'}</span>
                    </div>
                  ))}
                  {groupCount > 2 && <span className="pdt-group-more">+{groupCount - 2}</span>}
                  {!campaign.publishToProfile && groupCount === 0 && <span className="pdt-group-more">0 קבוצות</span>}
                </div>
              </div>

              {/* Status column */}
              <div className="pdt-col pdt-col-status">
                <span className="pdt-status-badge" style={{ background: statusConf.bg, borderColor: statusConf.border, color: statusConf.color }}>
                  <StatusIcon size={13} />
                  {statusConf.label}
                </span>
              </div>

              {/* Time column */}
              <div className="pdt-col pdt-col-time">
                {nextRun !== '—' ? (
                  <>
                    <span className="pdt-time-main">{nextRun.time}</span>
                    <span className="pdt-time-date">{nextRun.date}</span>
                  </>
                ) : <span className="pdt-time-none">—</span>}
              </div>

              {/* Actions */}
              <div className="pdt-col pdt-col-actions" onClick={e => e.stopPropagation()}>
                <button className="pdt-menu-btn" onClick={() => setMenuOpen(menuOpen === campaign.id ? null : campaign.id)}>
                  <MoreVertical size={18} />
                </button>
                {menuOpen === campaign.id && (
                  <div className="pdt-menu-dropdown">
                    <button onClick={() => handleEdit(campaign)}>ערוך</button>
                    <button onClick={() => handleDuplicate(campaign)}>שכפל</button>
                    <button onClick={() => handleDelete(campaign)}>מחק</button>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
      {confirmDelete && (
        <div className="pdt-confirm-overlay" onClick={() => setConfirmDelete(null)}>
          <div className="pdt-confirm-dialog" onClick={e => e.stopPropagation()}>
            <h4>מחיקת קמפיין</h4>
            <p>האם אתה בטוח שברצונך למחוק את הקמפיין? פעולה זו לא ניתנת לביטול.</p>
            <div className="pdt-confirm-actions">
              <button className="pdt-confirm-cancel" onClick={() => setConfirmDelete(null)}>ביטול</button>
              <button className="pdt-confirm-delete" onClick={confirmDeleteAction}>מחק</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
