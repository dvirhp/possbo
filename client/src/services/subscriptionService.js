import http from './http'

export const subscriptionService = {
  // Get current subscription status
  getMySubscription() {
    return http.get('/subscription/me')
  },

  // Get available plans
  getPlans() {
    return http.get('/subscription/plans')
  },

  // Create a new subscription (with payment token from provider)
  createSubscription(data) {
    return http.post('/subscription/subscribe', data)
  },

  // Cancel subscription
  cancelSubscription() {
    return http.post('/subscription/cancel')
  },

  // Get payment history
  getPaymentHistory() {
    return http.get('/subscription/payments')
  }
}
