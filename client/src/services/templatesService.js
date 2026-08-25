import api from "./http";
import { buildFormData } from "../utils/formData";

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
