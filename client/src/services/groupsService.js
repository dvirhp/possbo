import api from "./http";

export const groupsService = {
  getSavedGroups: () => api.get("/groups/saved"),
  scrapeMyGroups: () => api.get("/groups/scrape-my-groups"),
  getGroupPosts: (groupId) => api.get(`/groups/${groupId}/posts`),
  bootstrapSession: () => api.post("/groups/session/bootstrap", {}, { timeout: 360000 }),
  getPublicationHistory: () => api.get("/scheduler/history"),
  getJobs: () => api.get("/scheduler/jobs"),
  getCampaigns: () => api.get("/scheduler/campaigns"),
  createCampaign: (data) => api.post("/scheduler/campaigns", data),
  togglePause: (postId) => api.patch(`/scheduler/campaigns/${postId}/pause`),
  schedulePost: (data) => api.post("/scheduler/schedule", data),
  cancelJob: (jobId) => api.delete(`/scheduler/jobs/${jobId}`),
  getNotifications: () => api.get("/scheduler/notifications"),
  markNotificationsRead: () => api.patch("/scheduler/notifications/read"),
  getSessionStatus: () => api.get("/scheduler/session-status"),
  getStats: (params) => api.get("/scheduler/stats", { params }),
};
