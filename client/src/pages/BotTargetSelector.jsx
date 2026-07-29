import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Check, Search, Users, UserRound, Megaphone, X } from 'lucide-react'
import '../styles/bot-target-selector.css'

export default function BotTargetSelector() {
  const { token } = useParams()
  const [data, setData] = useState(null)
  const [selected, setSelected] = useState(new Set())
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    let active = true
    fetch(`/webhooks/whatsapp/selection/${encodeURIComponent(token)}`)
      .then(async response => {
        const body = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(body.error || 'לא ניתן לטעון את היעדים.')
        return body
      })
      .then(body => {
        if (!active) return
        setData(body)
        setSelected(new Set(body.selectedIds || []))
      })
      .catch(err => active && setError(err.message))
      .finally(() => active && setLoading(false))
    return () => { active = false }
  }, [token])

  const filteredItems = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('he')
    if (!normalized) return data?.items || []
    return (data?.items || []).filter(item =>
      `${item.name} ${item.description || ''}`.toLocaleLowerCase('he').includes(normalized)
    )
  }, [data, query])

  const toggle = id => {
    setSelected(current => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectVisible = () => {
    setSelected(current => {
      const next = new Set(current)
      filteredItems.forEach(item => next.add(item.id))
      return next
    })
  }

  const clearVisible = () => {
    setSelected(current => {
      const next = new Set(current)
      filteredItems.forEach(item => next.delete(item.id))
      return next
    })
  }

  const save = async () => {
    setSaving(true)
    setError('')
    try {
      const response = await fetch(`/webhooks/whatsapp/selection/${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selectedIds: [...selected] }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error || 'שמירת הבחירה נכשלה.')
      setSaved(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <main className="bot-selector-state">טוען את היעדים…</main>
  }

  if (saved) {
    return (
      <main className="bot-selector-state bot-selector-success" dir="rtl">
        <div className="bot-selector-success-icon"><Check size={34} /></div>
        <h1>הבחירה נשמרה</h1>
        <p>אפשר לסגור את החלון ולחזור ל-WhatsApp. פוסבוט כבר ממשיך איתך שם.</p>
      </main>
    )
  }

  if (!data) {
    return (
      <main className="bot-selector-state" dir="rtl">
        <h1>הקישור אינו זמין</h1>
        <p>{error || 'חזור לפוסבוט ובקש קישור חדש.'}</p>
      </main>
    )
  }

  return (
    <main className="bot-selector-page" dir="rtl">
      <section className="bot-selector-card">
        <header className="bot-selector-header">
          <div className="bot-selector-brand">Possbo</div>
          <h1>{data.title}</h1>
          <p>{data.subtitle}</p>
        </header>

        <div className="bot-selector-toolbar">
          <label className="bot-selector-search">
            <Search size={20} />
            <input
              autoFocus
              type="search"
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="חיפוש לפי שם…"
              aria-label="חיפוש יעדים"
            />
            {query && (
              <button type="button" onClick={() => setQuery('')} aria-label="נקה חיפוש">
                <X size={18} />
              </button>
            )}
          </label>
          <div className="bot-selector-actions">
            <button type="button" onClick={selectVisible}>בחר את המוצגים</button>
            <button type="button" onClick={clearVisible}>נקה את המוצגים</button>
          </div>
          <div className="bot-selector-counts">
            <span>{selected.size} נבחרו</span>
            <span>{filteredItems.length} מוצגים מתוך {data.items.length}</span>
          </div>
        </div>

        <div className="bot-selector-list">
          {filteredItems.map(item => {
            const checked = selected.has(item.id)
            const Icon = item.type === 'profile'
              ? UserRound
              : item.type === 'broadcast'
                ? Megaphone
                : Users
            return (
              <label key={item.id} className={`bot-selector-item${checked ? ' selected' : ''}`}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(item.id)}
                />
                <span className="bot-selector-checkbox" aria-hidden="true">
                  {checked && <Check size={16} />}
                </span>
                <span className="bot-selector-item-icon"><Icon size={20} /></span>
                <span className="bot-selector-item-copy">
                  <strong>{item.name}</strong>
                  <small>{item.description}</small>
                </span>
              </label>
            )
          })}
          {filteredItems.length === 0 && (
            <div className="bot-selector-empty">לא נמצאו יעדים התואמים לחיפוש.</div>
          )}
        </div>

        {error && <p className="bot-selector-error" role="alert">{error}</p>}

        <footer className="bot-selector-footer">
          <button className="bot-selector-save" type="button" onClick={save} disabled={saving}>
            {saving ? 'שומר…' : `שמור ${selected.size} יעדים`}
          </button>
          <p>השמירה תעדכן את פוסבוט ותמשיך את התהליך אוטומטית.</p>
        </footer>
      </section>
    </main>
  )
}
