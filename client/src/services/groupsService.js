import api from "./http";

export const groupsService = {
  getSavedGroups: () => api.get("/groups/saved"),
  scrapeMyGroups: () => api.get("/groups/scrape-my-groups"),
  getGroupPosts: (groupId) => api.get(`/groups/${groupId}/posts`),
  bootstrapSession: () => api.post("/groups/session/bootstrap"),
};
