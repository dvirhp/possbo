import api from "./http";
import { buildFormData } from "../utils/formData";

export const groupsService = {
  getDashboardData: () => api.get("/scheduler/dashboard-data"),
  getSavedGroups: () => api.get("/groups/saved"),
  scrapeMyGroups: () =>
    api.get("/groups/scrape-my-groups", { timeout: 120000 }),
  refreshGroupsMetadata: () =>
    api.post("/groups/refresh-metadata", {}, { timeout: 30000 }),
  getRefreshMetadataStatus: () => api.get("/groups/refresh-metadata/status"),
  getGroupPosts: (groupId) => api.get(`/groups/${groupId}/posts`),
  bootstrapSession: () =>
    api.post("/groups/session/bootstrap", {}, { timeout: 360000 }),
  getPublicationHistory: () => api.get("/scheduler/history"),
  getPublication: (pubId) => api.get(`/scheduler/history/${pubId}`),
  getJobs: () => api.get("/scheduler/jobs"),
  getCampaigns: () => api.get("/scheduler/campaigns"),
  getRecentCampaigns: () => api.get("/scheduler/campaigns/recent"),
  getCampaign: (postId) => api.get(`/scheduler/campaigns/${postId}`),
  createCampaign: (data, images, igTypeMedia) => {
    const hasIgMedia =
      igTypeMedia && Object.values(igTypeMedia).some((arr) => arr?.length > 0);
    if (images?.length || hasIgMedia) {
      const fd = buildFormData(data, images, hasIgMedia ? igTypeMedia : null);
      return api.post("/scheduler/campaigns", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
    }
    return api.post("/scheduler/campaigns", data);
  },
  updateCampaign: (postId, data, images, igTypeMedia) => {
    const hasIgMedia =
      igTypeMedia && Object.values(igTypeMedia).some((arr) => arr?.length > 0);
    if (images?.length || hasIgMedia) {
      const fd = buildFormData(data, images, hasIgMedia ? igTypeMedia : null);
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
  getDashboardKpis: (params) =>
    api.get("/scheduler/dashboard-kpis", { params }),
  refreshPublicationMetrics: (publicationId) =>
    api.post(
      `/scheduler/publications/${publicationId}/refresh-metrics`,
      {},
      { timeout: 60000 },
    ),
  getTopPosts: (params) => api.get("/scheduler/top-posts", { params }),
  refreshAllMetrics: () =>
    api.post("/scheduler/refresh-all-metrics", {}, { timeout: 300000 }),
};
