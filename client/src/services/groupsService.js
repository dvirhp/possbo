import api from './http'

export const groupsService = {
  scrapeMyGroups: () => api.get('/groups/scrape-my-groups'),
  bootstrapSession: () => api.post('/groups/session/bootstrap'),
}
