import api from './http'

export const publishService = {
  publish: (groupUrl, text, imageFile, groupName, anonymous = false, location = '') => {
    const formData = new FormData()
    formData.append('groupUrl', groupUrl)
    formData.append('text', text)
    if (groupName) {
      formData.append('groupName', groupName)
    }
    if (anonymous) {
      formData.append('anonymous', 'true')
    }
    if (location) {
      formData.append('location', location)
    }
    if (imageFile) {
      formData.append('image', imageFile)
    }
    return api.post('/publish', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 120000,
    })
  },

  getHistory: (groupUrl) => {
    const params = groupUrl ? `?groupUrl=${encodeURIComponent(groupUrl)}` : ''
    return api.get(`/publish/history${params}`)
  },
}
