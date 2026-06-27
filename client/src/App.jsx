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
import './App.css'

function GlobalPublishBanner() {
  const [banner, setBanner] = useState(null)

  useEffect(() => {
    const handleStart = (e) => {
      setBanner({ type: 'progress', msg: `⏳ מפרסם ב-${e.detail.count} קבוצות...` })
    }
    const handleDone = (e) => {
      const { allSuccess, total, failed } = e.detail
      if (allSuccess) {
        setBanner({ type: 'success', msg: `✅ פורסם בהצלחה ב-${total} קבוצות!` })
        confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } })
      } else {
        setBanner({ type: 'error', msg: `⚠️ ${total - failed}/${total} פורסמו. ${failed} נכשלו.` })
      }
      setTimeout(() => setBanner(null), 8000)
    }
    window.addEventListener('postit-publish-start', handleStart)
    window.addEventListener('postit-publish-done', handleDone)
    return () => {
      window.removeEventListener('postit-publish-start', handleStart)
      window.removeEventListener('postit-publish-done', handleDone)
    }
  }, [])

  if (!banner) return null

  const colorClass = banner.type === 'progress' ? 'global-banner-progress'
    : banner.type === 'success' ? 'global-banner-success' : 'global-banner-error'

  return (
    <div className={`global-publish-banner ${colorClass}`}>
      <span>{banner.msg}</span>
      {banner.type !== 'progress' && (
        <button onClick={() => setBanner(null)}>✕</button>
      )}
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
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/my-groups" element={<Navigate to="/dashboard" state={{ tab: 'groups' }} replace />} />
          <Route path="/create-post" element={<CreatePost />} />
          <Route path="/scheduled" element={<ScheduledCalendar />} />
          <Route path="/group/:id" element={<GroupDetails />} />
          <Route path="/post/:id" element={<PostDetails />} />
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
