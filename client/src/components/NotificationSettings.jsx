import { useState, useEffect } from 'react'
import { X, Bell, BellOff, Mail, Smartphone, CheckCircle, XCircle, Clock } from 'lucide-react'
import { authAPI } from '../services/api'
import { disablePush, enablePush, getPushSubscription, pushSupported, sendTestPush } from '../services/pushService'
import '../styles/notification-settings.css'

export default function NotificationSettings({ open, onClose }) {
  const [settings, setSettings] = useState({
    enabled: true,
    emailOnSuccess: true,
    emailOnFailure: true,
    emailOnSchedule: false,
    pushOnSuccess: true,
    pushOnFailure: true,
    pushOnSchedule: false,
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState(false)
  const [pushActive, setPushActive] = useState(false)
  const [pushBusy, setPushBusy] = useState(false)
  const [pushMessage, setPushMessage] = useState('')

  useEffect(() => {
    if (open) {
      // Load settings from backend
      authAPI.getMe().then(res => {
        if (res.data?.notificationSettings) {
          setSettings(prev => ({ ...prev, ...res.data.notificationSettings }))
        }
      }).catch(() => {})
      getPushSubscription().then(subscription => setPushActive(Boolean(subscription))).catch(() => setPushActive(false))
    }
  }, [open])

  const handleToggle = (key) => {
    setSettings(prev => ({ ...prev, [key]: !prev[key] }))
    setSaved(false)
    setSaveError(false)
  }

  const handlePushDevice = async () => {
    setPushBusy(true)
    setPushMessage('')
    try {
      if (pushActive) { await disablePush(); setPushActive(false); setPushMessage('התראות Push כובו במכשיר הזה.') }
      else { await enablePush(); setPushActive(true); setPushMessage('המכשיר מחובר להתראות Push.') }
    } catch (error) {
      setPushMessage(error.message === 'PUSH_PERMISSION_DENIED' ? 'הדפדפן לא אישר התראות. ניתן לשנות זאת בהגדרות האתר.' : 'לא הצלחנו להפעיל Push במכשיר הזה.')
    } finally { setPushBusy(false) }
  }

  const handleMasterToggle = () => {
    const newEnabled = !settings.enabled
    setSettings(prev => ({
      ...prev,
      enabled: newEnabled,
      emailOnSuccess: newEnabled ? prev.emailOnSuccess : false,
      emailOnFailure: newEnabled ? prev.emailOnFailure : false,
      emailOnSchedule: newEnabled ? prev.emailOnSchedule : false,
      pushOnSuccess: newEnabled ? prev.pushOnSuccess : false,
      pushOnFailure: newEnabled ? prev.pushOnFailure : false,
      pushOnSchedule: newEnabled ? prev.pushOnSchedule : false,
    }))
    setSaved(false)
    setSaveError(false)
  }

  const handleSave = async () => {
    setSaving(true)
    setSaveError(false)
    try {
      await authAPI.updateNotificationSettings(settings)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch {
      setSaved(false)
      setSaveError(true)
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <>
      <div className="notif-overlay" onClick={onClose} />
      <div className="notif-panel" role="dialog" aria-modal="true" aria-labelledby="notif-settings-title">
        <div className="notif-panel-header">
          <h3 id="notif-settings-title">
            <Bell size={18} />
            הגדרות התראות
          </h3>
          <button className="notif-close" onClick={onClose} aria-label="סגור הגדרות התראות">
            <X size={18} />
          </button>
        </div>

        {/* Master Toggle */}
        <div className="notif-master">
          <div className="notif-master-info">
            {settings.enabled ? <Bell size={20} className="notif-master-icon active" /> : <BellOff size={20} className="notif-master-icon" />}
            <div>
              <span className="notif-master-label">{settings.enabled ? 'התראות פעילות' : 'התראות כבויות'}</span>
              <span className="notif-master-hint">{settings.enabled ? 'תקבל עדכונים על פעילות החשבון' : 'לא תקבל שום התראות'}</span>
            </div>
          </div>
          <button
            className={`notif-toggle-switch ${settings.enabled ? 'on' : ''}`}
            onClick={handleMasterToggle}
            aria-label={settings.enabled ? 'כבה התראות' : 'הפעל התראות'}
            aria-pressed={settings.enabled}
          >
            <span className="notif-toggle-knob" />
          </button>
        </div>

        {settings.enabled && (
          <>
            {/* Email Notifications */}
            <div className="notif-group">
              <div className="notif-group-title">
                <Mail size={16} />
                התראות מייל
              </div>
              <div className="notif-option">
                <div className="notif-option-info">
                  <CheckCircle size={16} className="notif-opt-icon success" />
                  <span>פרסום הצליח</span>
                </div>
                <button
                  className={`notif-toggle-switch small ${settings.emailOnSuccess ? 'on' : ''}`}
                  onClick={() => handleToggle('emailOnSuccess')}
                  aria-label="התראות מייל על פרסום שהצליח"
                  aria-pressed={settings.emailOnSuccess}
                >
                  <span className="notif-toggle-knob" />
                </button>
              </div>

              <div className="notif-option">
                <div className="notif-option-info">
                  <XCircle size={16} className="notif-opt-icon failed" />
                  <span>פרסום נכשל</span>
                </div>
                <button
                  className={`notif-toggle-switch small ${settings.emailOnFailure ? 'on' : ''}`}
                  onClick={() => handleToggle('emailOnFailure')}
                  aria-label="התראות מייל על פרסום שנכשל"
                  aria-pressed={settings.emailOnFailure}
                >
                  <span className="notif-toggle-knob" />
                </button>
              </div>

              <div className="notif-option">
                <div className="notif-option-info">
                  <Clock size={16} className="notif-opt-icon schedule" />
                  <span>פוסט תוזמן</span>
                </div>
                <button
                  className={`notif-toggle-switch small ${settings.emailOnSchedule ? 'on' : ''}`}
                  onClick={() => handleToggle('emailOnSchedule')}
                  aria-label="התראות מייל על פוסט שתוזמן"
                  aria-pressed={settings.emailOnSchedule}
                >
                  <span className="notif-toggle-knob" />
                </button>
              </div>
            </div>

            {/* Push Notifications */}
            <div className="notif-group">
              <div className="notif-group-title">
                <Smartphone size={16} />
                התראות לטלפון
              </div>
              <div className="notif-push-device">
                <span>{!pushSupported() ? 'הדפדפן הזה אינו תומך ב-Push' : pushActive ? 'המכשיר מחובר ל-Push' : 'Push עדיין לא הופעל במכשיר הזה'}</span>
                {pushSupported() && <div><button type="button" onClick={handlePushDevice} disabled={pushBusy}>{pushBusy ? 'מעדכן…' : pushActive ? 'כיבוי במכשיר' : 'הפעלת Push'}</button>{pushActive && <button type="button" onClick={() => sendTestPush().then(() => setPushMessage('התראת בדיקה נשלחה.')).catch(() => setPushMessage('שליחת הבדיקה נכשלה.'))}>שליחת בדיקה</button>}</div>}
              </div>
              {pushMessage && <p className="notif-push-message" role="status">{pushMessage}</p>}

              <div className="notif-option">
                <div className="notif-option-info">
                  <CheckCircle size={16} className="notif-opt-icon success" />
                  <span>פרסום הצליח</span>
                </div>
                <button
                  className={`notif-toggle-switch small ${settings.pushOnSuccess ? 'on' : ''}`}
                  onClick={() => handleToggle('pushOnSuccess')}
                  aria-label="התראות לטלפון על פרסום שהצליח"
                  aria-pressed={settings.pushOnSuccess}
                >
                  <span className="notif-toggle-knob" />
                </button>
              </div>

              <div className="notif-option">
                <div className="notif-option-info">
                  <XCircle size={16} className="notif-opt-icon failed" />
                  <span>פרסום נכשל</span>
                </div>
                <button
                  className={`notif-toggle-switch small ${settings.pushOnFailure ? 'on' : ''}`}
                  onClick={() => handleToggle('pushOnFailure')}
                  aria-label="התראות לטלפון על פרסום שנכשל"
                  aria-pressed={settings.pushOnFailure}
                >
                  <span className="notif-toggle-knob" />
                </button>
              </div>

              <div className="notif-option">
                <div className="notif-option-info">
                  <Clock size={16} className="notif-opt-icon schedule" />
                  <span>פוסט תוזמן</span>
                </div>
                <button
                  className={`notif-toggle-switch small ${settings.pushOnSchedule ? 'on' : ''}`}
                  onClick={() => handleToggle('pushOnSchedule')}
                  aria-label="התראות לטלפון על פוסט שתוזמן"
                  aria-pressed={settings.pushOnSchedule}
                >
                  <span className="notif-toggle-knob" />
                </button>
              </div>
            </div>
          </>
        )}

        <button className="notif-save-btn" onClick={handleSave} disabled={saving}>
          {saving ? 'שומר...' : saved ? '✓ נשמר!' : saveError ? 'השמירה נכשלה - נסו שוב' : 'שמור הגדרות'}
        </button>
      </div>
    </>
  )
}
