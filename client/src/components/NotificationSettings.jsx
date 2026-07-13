import { useState, useEffect } from 'react'
import { X, Bell, BellOff, Mail, Smartphone, CheckCircle, XCircle, Clock } from 'lucide-react'
import { authAPI } from '../services/api'
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

  useEffect(() => {
    if (open) {
      // Load settings from backend
      authAPI.getMe().then(res => {
        if (res.data?.notificationSettings) {
          setSettings(prev => ({ ...prev, ...res.data.notificationSettings }))
        }
      }).catch(() => {})
    }
  }, [open])

  const handleToggle = (key) => {
    setSettings(prev => ({ ...prev, [key]: !prev[key] }))
    setSaved(false)
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
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 5000)
      await authAPI.updateNotificationSettings(settings)
      clearTimeout(timeout)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch {
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <>
      <div className="notif-overlay" onClick={onClose} />
      <div className="notif-panel">
        <div className="notif-panel-header">
          <h3>
            <Bell size={18} />
            הגדרות התראות
          </h3>
          <button className="notif-close" onClick={onClose}>
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

              <div className="notif-option">
                <div className="notif-option-info">
                  <CheckCircle size={16} className="notif-opt-icon success" />
                  <span>פרסום הצליח</span>
                </div>
                <button
                  className={`notif-toggle-switch small ${settings.pushOnSuccess ? 'on' : ''}`}
                  onClick={() => handleToggle('pushOnSuccess')}
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
                >
                  <span className="notif-toggle-knob" />
                </button>
              </div>
            </div>
          </>
        )}

        <button className="notif-save-btn" onClick={handleSave} disabled={saving}>
          {saving ? 'שומר...' : saved ? '✓ נשמר!' : 'שמור הגדרות'}
        </button>
      </div>
    </>
  )
}
