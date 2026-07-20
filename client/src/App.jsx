import { useState, useEffect, useRef, lazy, Suspense } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { DataProvider } from './context/DataProvider'
import { ThemeProvider } from './context/ThemeProvider'
import { NavigationGuardProvider } from './context/NavigationGuard'
import TopLoader from './components/TopLoader'
import confetti from 'canvas-confetti'
import { groupsService } from './services/groupsService'
import Landing from './pages/Landing'
import Login from './pages/Login'
import Register from './pages/Register'
import AuthLayout from './components/AuthLayout'
import ChatBot from './components/ChatBot'
import AccessibilityWidget from './components/AccessibilityWidget'
import ErrorBoundary from './components/ErrorBoundary'
import './App.css'
import './styles/sidebar.css'

// Lazy-loaded pages (code splitting — reduces initial bundle)
const Dashboard = lazy(() => import('./pages/Dashboard'))
const CreatePost = lazy(() => import('./pages/CreatePost'))
const ScheduledCalendar = lazy(() => import('./pages/ScheduledCalendar'))
const GroupDetails = lazy(() => import('./pages/GroupDetails'))
const PostDetails = lazy(() => import('./pages/PostDetails'))
const OAuthCallback = lazy(() => import('./pages/OAuthCallback'))
const Privacy = lazy(() => import('./pages/Privacy'))
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'))
const Templates = lazy(() => import('./pages/Templates'))
const TemplateForm = lazy(() => import('./pages/TemplateForm'))
const Reports = lazy(() => import('./pages/Reports'))
const Guides = lazy(() => import('./pages/Guides'))
const Subscription = lazy(() => import('./pages/Subscription'))
const GeneratePost = lazy(() => import('./pages/GeneratePost'))
const Feedback = lazy(() => import('./pages/Feedback'))

const PUBLIC_ROUTES = ['/', '/login', '/register', '/forgot-password']

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => { window.scrollTo(0, 0) }, [pathname])
  return null
}

function AuthWidgets() {
  const { pathname } = useLocation()
  if (PUBLIC_ROUTES.includes(pathname)) return null
  return (
    <>
      <ChatBot />
    </>
  )
}

const MAX_VISIBLE_BANNERS = 2

function GlobalPublishBanner() {
  const [banners, setBanners] = useState([])
  const pollRef = useRef(null)

  useEffect(() => {
    const addBanner = (id, banner) => {
      setBanners(prev => {
        const existing = prev.findIndex(b => b.id === id)
        if (existing >= 0) {
          const updated = [...prev]
          updated[existing] = { ...banner, id }
          return updated
        }
        return [...prev, { ...banner, id }]
      })
    }

    const removeBanner = (id) => {
      setBanners(prev => prev.filter(b => b.id !== id))
    }

    // Publish events
    const handlePublishStart = (e) => {
      const { count, postId, targets } = e.detail
      const targetParts = []
      if (targets?.groups) targetParts.push(`${targets.groups} קבוצות`)
      if (targets?.profile) targetParts.push('פרופיל')
      if (targets?.instagram) targetParts.push('Instagram')
      const targetLabel = targetParts.length > 0 ? targetParts.join(' + ') : `${count} יעדים`
      addBanner('publish', { type: 'progress', msg: `⏳ מפרסם ב-${targetLabel}...` })

      // Poll for completion
      if (postId) {
        if (pollRef.current) clearInterval(pollRef.current)
        pollRef.current = setInterval(async () => {
          try {
            const res = await groupsService.getCampaign(postId)
            const campaign = res.data?.campaign
            if (!campaign) return
            const history = campaign.publicationHistory || []
            const totalJobs = (campaign.groups?.length || 0) + (campaign.publishToProfile ? 1 : 0) + (campaign.instagramEnabled ? 1 : 0)
            const completed = history.length
            if (completed >= totalJobs && totalJobs > 0) {
              clearInterval(pollRef.current)
              pollRef.current = null
              const failed = history.filter(h => h.status === 'FAILED').length
              const succeeded = history.filter(h => h.status === 'SUCCESS').length
              // Build platform-aware success message
              const successParts = []
              const fbSuccess = history.filter(h => h.status === 'SUCCESS' && h.platform !== 'INSTAGRAM').length
              const igSuccess = history.filter(h => h.status === 'SUCCESS' && h.platform === 'INSTAGRAM').length
              if (fbSuccess > 0) successParts.push(`${fbSuccess} בפייסבוק`)
              if (igSuccess > 0) successParts.push(`${igSuccess} באינסטגרם`)
              const successLabel = successParts.length > 0 ? successParts.join(' + ') : `${succeeded} יעדים`
              if (failed === 0) {
                addBanner('publish', { type: 'success', msg: `✅ פורסם בהצלחה ב-${successLabel}!` })
                confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } })
              } else {
                addBanner('publish', { type: 'error', msg: `⚠️ ${succeeded}/${totalJobs} פורסמו. ${failed} נכשלו.` })
              }
              setTimeout(() => removeBanner('publish'), 8000)
              window.dispatchEvent(new CustomEvent('postit-publish-done', { detail: { allSuccess: failed === 0, total: totalJobs, failed, targets: { groups: campaign.groups?.length || 0, profile: campaign.publishToProfile, instagram: campaign.instagramEnabled } } }))
            } else if (completed > 0) {
              addBanner('publish', { type: 'progress', msg: `⏳ מפרסם... ${completed}/${totalJobs} הושלמו` })
            }
          } catch {
            // Ignore polling errors
          }
        }, 5000)
      }
    }
    const handlePublishDone = (e) => {
      if (pollRef.current) return // Already handled by polling
      const { allSuccess, total, failed, targets } = e.detail
      const label = targets
        ? [targets.groups && `${targets.groups} קבוצות`, targets.profile && 'פרופיל', targets.instagram && 'Instagram'].filter(Boolean).join(' + ')
        : `${total} יעדים`
      if (allSuccess) {
        addBanner('publish', { type: 'success', msg: `✅ פורסם בהצלחה ב-${label}!` })
        confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } })
      } else {
        addBanner('publish', { type: 'error', msg: `⚠️ ${total - failed}/${total} פורסמו. ${failed} נכשלו.` })
      }
      setTimeout(() => removeBanner('publish'), 8000)
    }

    // Sync groups events
    const handleSyncStart = (e) => {
      addBanner('sync-groups', { type: 'progress', msg: e.detail?.msg || 'מסנכרן קבוצות מפייסבוק...' })
    }
    const handleSyncDone = (e) => {
      const { success, msg } = e.detail
      addBanner('sync-groups', { type: success ? 'success' : 'error', msg })
      setTimeout(() => removeBanner('sync-groups'), 4000)
    }

    // Generic operation events (for any future operations)
    const handleOpStart = (e) => {
      const { id, msg } = e.detail
      addBanner(id, { type: 'progress', msg })
    }
    const handleOpDone = (e) => {
      const { id, success, msg } = e.detail
      addBanner(id, { type: success ? 'success' : 'error', msg })
      setTimeout(() => removeBanner(id), 4000)
    }

    window.addEventListener('postit-publish-start', handlePublishStart)
    window.addEventListener('postit-publish-done', handlePublishDone)
    window.addEventListener('postit-sync-start', handleSyncStart)
    window.addEventListener('postit-sync-done', handleSyncDone)
    window.addEventListener('postit-op-start', handleOpStart)
    window.addEventListener('postit-op-done', handleOpDone)
    return () => {
      window.removeEventListener('postit-publish-start', handlePublishStart)
      window.removeEventListener('postit-publish-done', handlePublishDone)
      window.removeEventListener('postit-sync-start', handleSyncStart)
      window.removeEventListener('postit-sync-done', handleSyncDone)
      window.removeEventListener('postit-op-start', handleOpStart)
      window.removeEventListener('postit-op-done', handleOpDone)
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [])

  if (banners.length === 0) return null

  const visibleBanners = banners.slice(-MAX_VISIBLE_BANNERS)
  const hiddenCount = banners.length - visibleBanners.length

  return (
    <div className="global-banners-container">
      {hiddenCount > 0 && (
        <div className="global-publish-banner global-banner-overflow">
          <span>+{hiddenCount} פעולות נוספות ברקע</span>
        </div>
      )}
      {visibleBanners.map(banner => {
        const colorClass = banner.type === 'progress' ? 'global-banner-progress'
          : banner.type === 'success' ? 'global-banner-success' : 'global-banner-error'
        return (
          <div key={banner.id} className={`global-publish-banner ${colorClass}`}>
            {banner.type === 'progress' && (
              <span className="global-banner-spinner"></span>
            )}
            <span>{banner.msg}</span>
            <button onClick={() => setBanners(prev => prev.filter(b => b.id !== banner.id))}>✕</button>
          </div>
        )
      })}
    </div>
  )
}

function App() {
  return (
    <ErrorBoundary>
    <ThemeProvider>
    <NavigationGuardProvider>
    <DataProvider>
      <Router>
        <ScrollToTop />
        <TopLoader />
        <GlobalPublishBanner />
        <Suspense fallback={null}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/dashboard" element={<AuthLayout><Dashboard /></AuthLayout>} />
          <Route path="/my-groups" element={<Navigate to="/dashboard?tab=groups" replace />} />
          <Route path="/create-post" element={<AuthLayout><CreatePost /></AuthLayout>} />
          <Route path="/scheduled" element={<AuthLayout><ScheduledCalendar /></AuthLayout>} />
          <Route path="/group/:id" element={<AuthLayout><GroupDetails /></AuthLayout>} />
          <Route path="/post/:id" element={<AuthLayout><PostDetails /></AuthLayout>} />
          <Route path="/templates" element={<AuthLayout><Templates /></AuthLayout>} />
          <Route path="/templates/new" element={<AuthLayout><TemplateForm /></AuthLayout>} />
          <Route path="/templates/:id/edit" element={<AuthLayout><TemplateForm /></AuthLayout>} />
          <Route path="/reports" element={<AuthLayout><Reports /></AuthLayout>} />
          <Route path="/guides" element={<AuthLayout><Guides /></AuthLayout>} />
          <Route path="/subscription" element={<AuthLayout><Subscription /></AuthLayout>} />
          <Route path="/generate-post" element={<AuthLayout><GeneratePost /></AuthLayout>} />
          <Route path="/feedback" element={<AuthLayout><Feedback /></AuthLayout>} />
          <Route path="/oauth/github/callback" element={<OAuthCallback />} />
          <Route path="/oauth/linkedin/callback" element={<OAuthCallback />} />
          <Route path="/oauth/apple/callback" element={<OAuthCallback />} />
          <Route path="/oauth/instagram/callback" element={<OAuthCallback />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
        </Routes>
        </Suspense>
        <AuthWidgets />
        <AccessibilityWidget />
      </Router>
    </DataProvider>
    </NavigationGuardProvider>
    </ThemeProvider>
    </ErrorBoundary>
  )
}

export default App
