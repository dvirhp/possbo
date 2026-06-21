import { NavLink, useLocation } from 'react-router-dom'

const NAV_ITEMS = [
  { path: '/dashboard', icon: '🏠', label: 'בית' },
  { path: '/create-post', icon: '✍️', label: 'פרסום' },
  { path: '/my-groups', icon: '👥', label: 'קבוצות' },
]

export default function BottomNav() {
  const location = useLocation()

  // Don't show on auth/landing pages
  const hiddenPaths = ['/', '/login', '/register']
  if (hiddenPaths.includes(location.pathname)) return null

  return (
    <nav className="bottom-nav">
      {NAV_ITEMS.map(item => (
        <NavLink
          key={item.path}
          to={item.path}
          className={({ isActive }) => `bottom-nav-item ${isActive ? 'active' : ''}`}
        >
          <span className="bottom-nav-icon">{item.icon}</span>
          <span className="bottom-nav-label">{item.label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
