import { useState, useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { DataProvider } from './context/DataProvider'
import { ThemeProvider } from './context/ThemeProvider'
import TopLoader from './components/TopLoader'
import confetti from 'canvas-confetti'
import Landing from './pages/Landing'
import Login from './pages/Login'
import Register from './pages/Register'
import Dashboard from './pages/Dashboard'
import CreatePost from './pages/CreatePost'
import ScheduledCalendar from './pages/ScheduledCalendar'
import GroupDetails from './pages/GroupDetails'
import PostDetails from './pages/PostDetails'
import OAuthCallback from './pages/OAuthCallback'
import Privacy from './pages/Privacy'
import ForgotPassword from './pages/ForgotPassword'
import AuthLayout from './components/AuthLayout'
import './App.css'
import './styles/sidebar.css'

function GlobalPublishBanner() {
  const [banners, setBanners] = useState([])

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
      addBanner('publish', { type: 'progress', msg: `⏳ מפרסם ב-${e.detail.count} קבוצות...` })
    }
    const handlePublishDone = (e) => {
      const { allSuccess, total, failed } = e.detail
      if (allSuccess) {
        addBanner('publish', { type: 'success', msg: `✅ פורסם בהצלחה ב-${total} קבוצות!` })
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
      setTimeout(() => removeBanner('sync-groups'), 5000)
    }

    // Generic operation events (for any future operations)
    const handleOpStart = (e) => {
      const { id, msg } = e.detail
      addBanner(id, { type: 'progress', msg })
    }
    const handleOpDone = (e) => {
      const { id, success, msg } = e.detail
      addBanner(id, { type: success ? 'success' : 'error', msg })
      setTimeout(() => removeBanner(id), 5000)
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
    }
  }, [])

  if (banners.length === 0) return null

  return (
    <div className="global-banners-container">
      {banners.map(banner => {
        const colorClass = banner.type === 'progress' ? 'global-banner-progress'
          : banner.type === 'success' ? 'global-banner-success' : 'global-banner-error'
        return (
          <div key={banner.id} className={`global-publish-banner ${colorClass}`}>
            {banner.type === 'progress' && (
              <span className="global-banner-spinner"></span>
            )}
            <span>{banner.msg}</span>
            {banner.type !== 'progress' && (
              <button onClick={() => setBanners(prev => prev.filter(b => b.id !== banner.id))}>✕</button>
            )}
          </div>
        )
      })}
    </div>
  )
}

function App() {
  return (
    <ThemeProvider>
    <DataProvider>
      <Router>
        <TopLoader />
        <GlobalPublishBanner />
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
          <Route path="/oauth/github/callback" element={<OAuthCallback />} />
          <Route path="/oauth/linkedin/callback" element={<OAuthCallback />} />
          <Route path="/oauth/apple/callback" element={<OAuthCallback />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
        </Routes>
      </Router>
    </DataProvider>
    </ThemeProvider>
  )
}

export default App
