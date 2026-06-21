import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import Landing from './pages/Landing'
import Login from './pages/Login'
import Register from './pages/Register'
import Dashboard from './pages/Dashboard'
import MyGroups from './pages/MyGroups'
import CreatePost from './pages/CreatePost'
import GroupDetails from './pages/GroupDetails'
import PostDetails from './pages/PostDetails'
import BottomNav from './components/BottomNav'
import './App.css'

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/my-groups" element={<MyGroups />} />
        <Route path="/create-post" element={<CreatePost />} />
        <Route path="/group/:id" element={<GroupDetails />} />
        <Route path="/post/:id" element={<PostDetails />} />
      </Routes>
      <BottomNav />
    </Router>
  )
}

export default App
