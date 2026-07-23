import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAppData } from '../context/DataProvider'
import { subscriptionService } from '../services/subscriptionService'
import '../styles/subscription.css'

const PLAN = {
  name: 'מסלול מקצועי',
  price: 300,
  currency: '₪',
  interval: 'חודש',
  features: [
    'פרסום אוטומטי בקבוצות פייסבוק',
    'תזמון פוסטים ללא הגבלה',
    'ניהול קבוצות מתקדם',
    'דוחות וסטטיסטיקות',
    'תמיכה בצ\'אט AI',
    'תבניות פוסטים'
  ]
}

// Dev mode: accept all-zeros card for testing
const DEV_CARD = '0000 0000 0000 0000'
const DEV_CVV_PATTERN = /^0+$/
const DEV_ID = '000000000'

function isDevPayment(cardNumber, cvv, idNumber) {
  return cardNumber === DEV_CARD && DEV_CVV_PATTERN.test(cvv) && idNumber === DEV_ID
}

export default function Subscription() {
  const navigate = useNavigate()
  const { user, checkAuth } = useAppData()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [step, setStep] = useState('plan') // 'plan' | 'payment' | 'success'

  // Payment form fields (will be replaced by tokenized provider fields in production)
  const [cardName, setCardName] = useState('')
  const [cardNumber, setCardNumber] = useState('')
  const [expiry, setExpiry] = useState('')
  const [cvv, setCvv] = useState('')
  const [idNumber, setIdNumber] = useState('')

  useEffect(() => {
    if (!user) {
      navigate('/login', { replace: true })
    }
  }, [user, navigate])

  const formatCardNumber = (value) => {
    const digits = value.replace(/\D/g, '').slice(0, 16)
    return digits.replace(/(\d{4})(?=\d)/g, '$1 ')
  }

  const formatExpiry = (value) => {
    const digits = value.replace(/\D/g, '').slice(0, 4)
    if (digits.length >= 3) return `${digits.slice(0, 2)}/${digits.slice(2)}`
    return digits
  }

  const handleSubscribe = async (e) => {
    e.preventDefault()

    if (!cardName || !cardNumber || !expiry || !cvv) {
      setError('יש למלא את כל שדות התשלום')
      return
    }

    // Dev mode: only accept all-zeros card
    if (!isDevPayment(cardNumber, cvv, idNumber)) {
      setError('בשלב הפיתוח יש להזין כרטיס בדיקה (אפסים בלבד)')
      return
    }

    setLoading(true)
    setError(null)

    try {
      // In production: tokenize card via payment provider SDK (e.g. PayPlus, Tranzila)
      // The token is sent to our server - never raw card details
      const paymentData = {
        planId: 'professional_monthly',
        // In production this would be a token from the payment provider:
        // token: await paymentProvider.createToken(cardElement)
      }

      await subscriptionService.createSubscription(paymentData)
      setStep('success')

      // Refresh user data so subscription is recognized
      await checkAuth()

      // Redirect to dashboard after success
      setTimeout(() => navigate('/dashboard'), 3000)
    } catch (err) {
      setError(err.userMessage || 'שגיאה בעיבוד התשלום. נסה שוב.')
    } finally {
      setLoading(false)
    }
  }

  if (!user) return null

  const hasActiveSubscription = user.subscription && user.subscription.status === 'ACTIVE'

  return (
    <div className="subscription-container">
      <div className="subscription-wrapper">
        {/* Logo & Back */}
        <div className="subscription-topbar">
          <Link to="/" className="subscription-logo">
            <img src="/logo.svg" alt="Possbo" className="subscription-logo-img" />
          </Link>
          <button onClick={() => navigate(-1)} className="subscription-back-btn">←</button>
        </div>

        {hasActiveSubscription ? (
          <div className="subscription-content">
            <div className="subscription-plan-card">
              <div className="subscription-plan-badge" style={{ background: '#22c55e' }}>פעיל</div>
              <h2 className="subscription-plan-name">{user.subscription.planName || PLAN.name}</h2>
              <div className="subscription-plan-price">
                <span className="subscription-price-amount">{PLAN.price}</span>
                <span className="subscription-price-currency">{PLAN.currency}</span>
                <span className="subscription-price-interval">/ {PLAN.interval}</span>
              </div>
              <ul className="subscription-features">
                {PLAN.features.map((feature, idx) => (
                  <li key={idx}>
                    <span className="subscription-feature-check">✓</span>
                    {feature}
                  </li>
                ))}
              </ul>
              {user.subscription.endsAt && (
                <div className="subscription-plan-note">
                  חידוש אוטומטי: {new Date(user.subscription.endsAt).toLocaleDateString('he-IL')}
                </div>
              )}
            </div>

            <div className="subscription-payment-card">
              <h3 className="subscription-payment-title">ניהול מנוי</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--border, rgba(255,255,255,0.08))' }}>
                  <span style={{ color: 'var(--text-primary, #e8ecf0)', fontWeight: 600 }}>סטטוס</span>
                  <span style={{ color: '#22c55e', fontWeight: 600 }}>● פעיל</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--border, rgba(255,255,255,0.08))' }}>
                  <span style={{ color: 'var(--text-primary, #e8ecf0)', fontWeight: 600 }}>מסלול</span>
                  <span style={{ color: 'var(--text-secondary, #a3adb8)' }}>{user.subscription.planName || PLAN.name}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--border, rgba(255,255,255,0.08))' }}>
                  <span style={{ color: 'var(--text-primary, #e8ecf0)', fontWeight: 600 }}>חיוב חודשי</span>
                  <span style={{ color: 'var(--text-secondary, #a3adb8)' }}>{PLAN.price} {PLAN.currency}</span>
                </div>
                {user.subscription.endsAt && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0' }}>
                    <span style={{ color: 'var(--text-primary, #e8ecf0)', fontWeight: 600 }}>תאריך חידוש</span>
                    <span style={{ color: 'var(--text-secondary, #a3adb8)' }}>{new Date(user.subscription.endsAt).toLocaleDateString('he-IL')}</span>
                  </div>
                )}
              </div>
              <button
                className="subscription-submit-btn"
                style={{ marginTop: 24 }}
                onClick={() => navigate('/dashboard')}
              >
                חזרה לדשבורד
              </button>
            </div>
          </div>
        ) : step === 'success' ? (
          <div className="subscription-success">
            <div className="subscription-success-icon">✓</div>
            <h2>התשלום בוצע בהצלחה!</h2>
            <p>המנוי שלך הופעל. מעביר אותך לדשבורד...</p>
            <div className="subscription-success-spinner"></div>
          </div>
        ) : (
          <div className="subscription-content">
            {/* Plan Summary Card */}
            <div className="subscription-plan-card">
              <div className="subscription-plan-badge">מומלץ</div>
              <h2 className="subscription-plan-name">{PLAN.name}</h2>
              <div className="subscription-plan-price">
                <span className="subscription-price-amount">{PLAN.price}</span>
                <span className="subscription-price-currency">{PLAN.currency}</span>
                <span className="subscription-price-interval">/ {PLAN.interval}</span>
              </div>
              <ul className="subscription-features">
                {PLAN.features.map((feature, idx) => (
                  <li key={idx}>
                    <span className="subscription-feature-check">✓</span>
                    {feature}
                  </li>
                ))}
              </ul>
              <div className="subscription-plan-note">
                ביטול בכל עת • חיוב יחסי בביטול באמצע חודש
              </div>
            </div>

            {/* Payment Form */}
            <div className="subscription-payment-card">
              <h3 className="subscription-payment-title">פרטי תשלום</h3>
              <p className="subscription-payment-subtitle">התשלום מאובטח ומוצפן</p>

              <form className="subscription-form" onSubmit={handleSubscribe}>
                <div className="subscription-field">
                  <label>שם בעל הכרטיס</label>
                  <input
                    type="text"
                    placeholder="ישראל ישראלי"
                    value={cardName}
                    onChange={(e) => setCardName(e.target.value)}
                    required
                  />
                </div>

                <div className="subscription-field">
                  <label>מספר כרטיס</label>
                  <input
                    type="text"
                    placeholder="0000 0000 0000 0000"
                    value={cardNumber}
                    onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
                    maxLength={19}
                    dir="ltr"
                    required
                  />
                </div>

                <div className="subscription-field-row">
                  <div className="subscription-field">
                    <label>תוקף</label>
                    <input
                      type="text"
                      placeholder="MM/YY"
                      value={expiry}
                      onChange={(e) => setExpiry(formatExpiry(e.target.value))}
                      maxLength={5}
                      dir="ltr"
                      required
                    />
                  </div>
                  <div className="subscription-field">
                    <label>CVV</label>
                    <input
                      type="text"
                      placeholder="•••"
                      value={cvv}
                      onChange={(e) => setCvv(e.target.value.replace(/\D/g, '').slice(0, 4))}
                      maxLength={4}
                      dir="ltr"
                      required
                    />
                  </div>
                </div>

                <div className="subscription-field">
                  <label>תעודת זהות</label>
                  <input
                    type="text"
                    placeholder="מספר ת.ז של בעל הכרטיס"
                    value={idNumber}
                    onChange={(e) => setIdNumber(e.target.value.replace(/\D/g, '').slice(0, 9))}
                    maxLength={9}
                    dir="ltr"
                  />
                </div>

                {error && <div className="subscription-error">{error}</div>}

                <div className="subscription-total">
                  <span>סה"כ לחיוב חודשי</span>
                  <span className="subscription-total-price">{PLAN.price} {PLAN.currency}</span>
                </div>

                <button
                  type="submit"
                  className="subscription-submit-btn"
                  disabled={loading}
                >
                  {loading ? (
                    <span className="subscription-btn-loading">מעבד תשלום...</span>
                  ) : (
                    `שלם ${PLAN.price} ${PLAN.currency} / ${PLAN.interval}`
                  )}
                </button>

                <div className="subscription-secure-note">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </svg>
                  <span>תשלום מאובטח בהצפנת SSL 256-bit</span>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
