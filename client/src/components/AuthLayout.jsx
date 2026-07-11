import { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAppData } from '../context/DataProvider'
import Sidebar from './Sidebar'
import BottomNav from './BottomNav'

export default function AuthLayout({ children }) {
  const { user, authChecked } = useAppData()
  const navigate = useNavigate()
  const location = useLocation()
  const [activeTab, setActiveTab] = useState('dashboard')

  // Determine active tab from route
  useEffect(() => {
    const path = location.pathname
    if (path === '/dashboard') {
      const tab = location.state?.tab || 'overview'
      if (tab === 'overview') setActiveTab('dashboard')
      else if (tab === 'campaigns') setActiveTab('posts')
      else if (tab === 'groups') setActiveTab('groups')
      else if (tab === 'stats') setActiveTab('analytics')
      else if (tab === 'posts') setActiveTab('history')
      else setActiveTab('dashboard')
    } else if (path === '/create-post') {
      setActiveTab('posts')
    } else if (path === '/scheduled') {
      setActiveTab('calendar')
    } else if (path.startsWith('/group/')) {
      setActiveTab('groups')
    }
  }, [location])

  // Redirect to login if not authenticated
  useEffect(() => {
    if (authChecked && !user) {
      navigate('/login')
    }
  }, [authChecked, user, navigate])

  if (!authChecked) {
    return (
      <div className="app-layout">
        <div className="app-main" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="loader-pulse"><div/><div/><div/></div>
        </div>
      </div>
    )
  }

  if (!user) return null

  return (
    <div className="app-layout">
      <Sidebar activeTab={activeTab} onTabChange={(tab) => {
        setActiveTab(tab)
      }} />
      <main className="app-main">
        {children}
      </main>
      <BottomNav />
    </div>
  )
}
