import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAppData } from '../context/DataProvider'
import { subscriptionService } from '../services/subscriptionService'
import BrandLogo from '../components/BrandLogo'
import '../styles/subscription.css'

export default function Subscription() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { user, logout } = useAppData()
  const [plans, setPlans] = useState([])
  const [billingAvailable, setBillingAvailable] = useState(false)
  const [selectedPlanId, setSelectedPlanId] = useState('')
  const [subscription, setSubscription] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!user) navigate('/login', { replace: true })
  }, [user, navigate])

  useEffect(() => {
    if (!user) return
    Promise.all([subscriptionService.getPlans(), subscriptionService.getMySubscription()])
      .then(([plansResponse, subscriptionResponse]) => {
        const availablePlans = plansResponse.data.plans || []
        setPlans(availablePlans)
        setSelectedPlanId(availablePlans[0]?.id || '')
        setBillingAvailable(Boolean(plansResponse.data.billingAvailable))
        setSubscription(subscriptionResponse.data.subscription)
      })
      .catch((requestError) => setError(requestError.userMessage || 'לא ניתן לטעון את פרטי המינוי'))
      .finally(() => setLoading(false))
  }, [user])

  const startCheckout = async () => {
    if (!selectedPlanId || !billingAvailable) return
    setLoading(true)
    setError('')
    try {
      const { data } = await subscriptionService.createSubscription({ planId: selectedPlanId })
      window.location.assign(data.checkoutUrl)
    } catch (requestError) {
      setError(requestError.userMessage || 'לא ניתן לפתוח את עמוד התשלום המאובטח')
      setLoading(false)
    }
  }

  const cancelSubscription = async () => {
    setLoading(true)
    setError('')
    try {
      await subscriptionService.cancelSubscription()
      const { data } = await subscriptionService.getMySubscription()
      setSubscription(data.subscription)
    } catch (requestError) {
      setError(requestError.userMessage || 'לא ניתן לבטל את המינוי כרגע')
    } finally {
      setLoading(false)
    }
  }

  const handleBack = async () => {
    await logout()
    navigate(-1)
  }

  if (!user) return null
  const checkoutState = searchParams.get('checkout')
  const active = subscription && ['ACTIVE', 'PAST_DUE'].includes(subscription.status)

  return (
    <div className="subscription-container">
      <div className="subscription-wrapper">
        <div className="subscription-topbar">
          <Link to="/" className="subscription-logo"><BrandLogo className="subscription-logo-img" /></Link>
          <button type="button" onClick={handleBack} className="subscription-back-btn" aria-label="חזרה וניתוק">←</button>
        </div>

        {checkoutState === 'success' && (
          <div className="subscription-success">
            <div className="subscription-success-icon">✓</div>
            <h2>התשלום התקבל לבדיקה</h2>
            <p>המינוי יופעל לאחר אישור חתום מספק הסליקה. אפשר לרענן בעוד מספר שניות.</p>
          </div>
        )}

        <div className="subscription-content">
          <div className="subscription-plan-card">
            <div className="subscription-plan-badge">{active ? 'פעיל' : 'מסלולים'}</div>
            <h2 className="subscription-plan-name">{subscription?.plan?.name || 'בחירת מסלול'}</h2>
            {!active && plans.map((plan) => (
              <label key={plan.id} className="subscription-plan-option">
                <input type="radio" name="plan" value={plan.id} checked={selectedPlanId === plan.id} onChange={() => setSelectedPlanId(plan.id)} />
                <span>{plan.name}</span>
                <strong>₪{Number(plan.priceMonthly).toFixed(2)} / חודש</strong>
              </label>
            ))}
            {subscription?.endsAt && <p className="subscription-plan-note">תקופה נוכחית עד {new Date(subscription.endsAt).toLocaleDateString('he-IL')}</p>}
          </div>

          <div className="subscription-payment-card">
            <h3 className="subscription-payment-title">{active ? 'ניהול מינוי' : 'תשלום מאובטח'}</h3>
            <p className="subscription-payment-subtitle">פרטי הכרטיס מוזנים רק בעמוד המאובטח של ספק הסליקה ואינם עוברים דרך Possbo.</p>
            {subscription?.status === 'PAST_DUE' && <div className="subscription-error">התשלום האחרון נכשל. יש לעדכן אמצעי תשלום אצל ספק הסליקה.</div>}
            {error && <div className="subscription-error">{error}</div>}
            {!billingAvailable && !active && <div className="subscription-error">הסליקה עדיין אינה מחוברת. לא ניתן להפעיל מינוי או לבצע חיוב.</div>}
            {active ? (
              <button type="button" className="subscription-submit-btn" onClick={cancelSubscription} disabled={loading || Boolean(subscription.cancelledAt)}>
                {subscription.cancelledAt ? 'הביטול נקלט לסוף התקופה' : 'ביטול בסוף תקופת החיוב'}
              </button>
            ) : (
              <button type="button" className="subscription-submit-btn" onClick={startCheckout} disabled={loading || !billingAvailable || !selectedPlanId}>
                {loading ? 'טוען…' : 'מעבר לתשלום המאובטח'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
