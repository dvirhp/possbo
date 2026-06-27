import axios from "axios";
import http, { setAccessToken, clearAccessToken } from "./http.js";

const API_BASE_URL = "http://localhost:5001/api";

const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
});

export const authAPI = {
  register: async (email, password, name, gender, phone, captchaToken) => {
    const res = await http.post("/auth/register", {
      email,
      password,
      name,
      gender,
      phone,
      captchaToken,
    });
    if (res.data.accessToken) {
      setAccessToken(res.data.accessToken);
    }
    return res;
  },
  login: async (email, password, captchaToken) => {
    const res = await http.post("/auth/login", { email, password, captchaToken });
    if (res.data.accessToken) {
      setAccessToken(res.data.accessToken);
    }
    return res;
  },
  getMe: () => http.get("/auth/me"),
  refresh: async () => {
    const res = await axios.post(
      `${API_BASE_URL}/auth/refresh`,
      {},
      { withCredentials: true },
    );
    if (res.data.accessToken) {
      setAccessToken(res.data.accessToken);
    }
    return res;
  },
  logout: async () => {
    const res = await http.post("/auth/logout");
    clearAccessToken();
    return res;
  },
  updateProfile: (data) => http.patch("/auth/profile", data),
  requestPasswordCode: (data) => http.post("/auth/password/request-code", data),
  changePassword: (data) => http.patch("/auth/password", data),
  forgotPassword: (data) => http.post("/auth/forgot-password", data),
  resetPassword: (data) => http.post("/auth/reset-password", data),
  verifyEmail: (data) => http.post("/auth/verify-email", data),
  resendCode: (data) => http.post("/auth/resend-code", data),
  updateWhatsapp: (data) => http.patch("/auth/whatsapp", data),
  disconnectFacebook: () => http.post("/auth/disconnect-facebook"),
};

export const groupsAPI = {
  searchGroup: (groupName) => api.post("/groups/search", { groupName }),
  getFacebookScreenshot: (groupName) =>
    api.get(
      `/groups/facebook-screenshot?groupName=${encodeURIComponent(groupName)}`,
      { timeout: 120000 },
    ),
  refreshScreenshot: (groupName) =>
    api.get(
      `/groups/refresh-screenshot?groupName=${encodeURIComponent(groupName)}`,
    ),
  bootstrapSession: () => api.post("/groups/session/bootstrap"),
  scrapeMyGroups: () => api.get("/groups/scrape-my-groups"),
  getMyGroups: () => api.get("/groups/my-groups"),
  getSavedGroups: () => api.get("/groups/saved"),
  publishToGroup: (groupUrl, text, imageFile) => {
    const formData = new FormData();
    formData.append("groupUrl", groupUrl);
    formData.append("text", text);
    if (imageFile) {
      formData.append("image", imageFile);
    }
    return api.post("/groups/publish", formData, {
      headers: { "Content-Type": "multipart/form-data" },
      timeout: 120000,
    });
  },
};

export default api;
