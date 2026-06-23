import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { DataProvider } from './context/DataProvider'
import { ThemeProvider } from './context/ThemeProvider'
import TopLoader from './components/TopLoader'
import Landing from './pages/Landing'
import Login from './pages/Login'
import Register from './pages/Register'
import Dashboard from './pages/Dashboard'
import CreatePost from './pages/CreatePost'
import ScheduledCalendar from './pages/ScheduledCalendar'
import GroupDetails from './pages/GroupDetails'
import PostDetails from './pages/PostDetails'
import './App.css'

function App() {
  return (
    <ThemeProvider>
    <DataProvider>
      <Router>
        <TopLoader />
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
        </Routes>
      </Router>
    </DataProvider>
    </ThemeProvider>
  )
}

export default App
