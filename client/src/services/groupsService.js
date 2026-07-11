import api from "./http";

function buildFormData(data, images) {
  const fd = new FormData();
  Object.entries(data).forEach(([key, val]) => {
    if (val === null || val === undefined) return;
    if (Array.isArray(val) || (typeof val === "object" && val !== null))
      fd.append(key, JSON.stringify(val));
    else fd.append(key, val);
  });
  if (images?.length) {
    for (const img of images) fd.append("images", img);
  }
  return fd;
}

export const groupsService = {
  getSavedGroups: () => api.get("/groups/saved"),
  scrapeMyGroups: () => api.get("/groups/scrape-my-groups", { timeout: 120000 }),
  refreshGroupsMetadata: () => api.post("/groups/refresh-metadata", {}, { timeout: 600000 }),
  getGroupPosts: (groupId) => api.get(`/groups/${groupId}/posts`),
  bootstrapSession: () =>
    api.post("/groups/session/bootstrap", {}, { timeout: 360000 }),
  getPublicationHistory: () => api.get("/scheduler/history"),
  getJobs: () => api.get("/scheduler/jobs"),
  getCampaigns: () => api.get("/scheduler/campaigns"),
  getRecentCampaigns: () => api.get("/scheduler/campaigns/recent"),
  getCampaign: (postId) => api.get(`/scheduler/campaigns/${postId}`),
  createCampaign: (data, images) => {
    if (images?.length) {
      const fd = buildFormData(data, images);
      return api.post("/scheduler/campaigns", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
    }
    return api.post("/scheduler/campaigns", data);
  },
  updateCampaign: (postId, data, images) => {
    if (images?.length) {
      const fd = buildFormData(data, images);
      return api.put(`/scheduler/campaigns/${postId}`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
    }
    return api.put(`/scheduler/campaigns/${postId}`, data);
  },
  deleteCampaign: (postId) => api.delete(`/scheduler/campaigns/${postId}`),
  duplicateCampaign: (postId) =>
    api.post(`/scheduler/campaigns/${postId}/duplicate`),
  togglePause: (postId) => api.patch(`/scheduler/campaigns/${postId}/pause`),
  schedulePost: (data) => api.post("/scheduler/schedule", data),
  cancelJob: (jobId) => api.delete(`/scheduler/jobs/${jobId}`),
  deleteHistory: (id) => api.delete(`/scheduler/history/${id}`),
  getNotifications: () => api.get("/scheduler/notifications"),
  markNotificationsRead: () => api.patch("/scheduler/notifications/read"),
  getSessionStatus: () => api.get("/scheduler/session-status"),
  getStats: (params) => api.get("/scheduler/stats", { params }),
  getExposure: (params) => api.get("/scheduler/exposure", { params }),
  getDashboardKpis: (params) => api.get("/scheduler/dashboard-kpis", { params }),
};
