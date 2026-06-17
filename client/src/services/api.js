import axios from 'axios'

const API_BASE_URL = 'http://localhost:5001/api'

const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
})

export const authAPI = {
  loginWithFacebook: () => {
    window.location.href = `${API_BASE_URL}/auth/facebook`
  },
  getMe: () => api.get('/auth/me'),
  getAutoScreenshot: () => api.get('/auth/screenshot'),
  logout: () => api.get('/auth/logout'),
}

export const groupsAPI = {
  searchGroup: (groupName) => api.post('/groups/search', { groupName }),
  getFacebookScreenshot: (groupName) => api.get(`/groups/facebook-screenshot?groupName=${encodeURIComponent(groupName)}`, { timeout: 120000 }),
  refreshScreenshot: (groupName) => api.get(`/groups/refresh-screenshot?groupName=${encodeURIComponent(groupName)}`),
  bootstrapSession: () => api.post('/groups/session/bootstrap'),
  scrapeMyGroups: () => api.get('/groups/scrape-my-groups'),
  getMyGroups: () => api.get('/groups/my-groups'),
  getSavedGroups: () => api.get('/groups/saved'),
  publishToGroup: (groupUrl, text, imageFile) => {
    const formData = new FormData()
    formData.append('groupUrl', groupUrl)
    formData.append('text', text)
    if (imageFile) {
      formData.append('image', imageFile)
    }
    return api.post('/groups/publish', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 120000,
    })
  },
}

export default api
