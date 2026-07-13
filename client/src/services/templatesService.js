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

export const templatesService = {
  getAll: () => api.get("/templates"),
  get: (id) => api.get(`/templates/${id}`),
  create: (data, images) => {
    if (images?.length) {
      return api.post("/templates", buildFormData(data, images), {
        headers: { "Content-Type": "multipart/form-data" },
      });
    }
    return api.post("/templates", data);
  },
  update: (id, data, images) => {
    if (images?.length) {
      return api.put(`/templates/${id}`, buildFormData(data, images), {
        headers: { "Content-Type": "multipart/form-data" },
      });
    }
    return api.put(`/templates/${id}`, data);
  },
  delete: (id) => api.delete(`/templates/${id}`),
  markUsed: (id) => api.post(`/templates/${id}/use`),
};
