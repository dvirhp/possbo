import http from './http'
export const operationsService = {
  summary: (hours = 24) => http.get('/operations/summary', { params: { hours } }),
  insights: (hours = 24) => http.get('/operations/insights', { params: { hours } }),
  events: (params = {}) => http.get('/operations/events', { params }),
}
