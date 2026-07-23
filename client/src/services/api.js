import axios from "axios";
import http, { setAccessToken, clearAccessToken } from "./http.js";

const API_BASE_URL = "/api";

const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
});

export const authAPI = {
  register: async (
    email,
    password,
    name,
    gender,
    phone,
    idNumber,
    captchaToken,
  ) => {
    const res = await http.post("/auth/register", {
      email,
      password,
      name,
      gender,
      phone,
      idNumber,
      captchaToken,
    });
    if (res.data.accessToken) {
      setAccessToken(res.data.accessToken);
    }
    return res;
  },
  login: async (email, password, captchaToken) => {
    const res = await http.post("/auth/login", {
      email,
      password,
      captchaToken,
    });
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
  verifyFacebook: () => http.post("/auth/verify-facebook"),
  // Instagram
  getInstagramStatus: () => http.get("/instagram/status"),
  getInstagramAuthUrl: () => http.get("/instagram/auth-url"),
  connectInstagram: (code) => http.post("/instagram/connect", { code }),
  disconnectInstagram: () => http.post("/instagram/disconnect"),
  publishToInstagram: (data) => http.post("/instagram/publish", data),
  // WhatsApp Session
  connectWhatsapp: () => http.post("/whatsapp/connect"),
  connectWhatsappPhone: (phoneNumber) =>
    http.post("/whatsapp/connect-phone", { phoneNumber }),
  getWhatsappStatus: () => http.get("/whatsapp/status"),
  disconnectWhatsapp: (signal) =>
    http.post("/whatsapp/disconnect", {}, { _noRetry: true, signal }),
  getWhatsappContacts: () => http.get("/whatsapp/contacts"),
  getWhatsappGroups: () => http.get("/whatsapp/groups"),
  syncWhatsappGroups: (signal) =>
    http.post("/whatsapp/groups/sync", {}, { _noRetry: true, signal }),
  syncWhatsappContacts: () => http.post("/whatsapp/contacts/sync"),
  // WhatsApp Broadcast Lists
  getWhatsappBroadcastLists: () => http.get("/whatsapp/broadcast-lists"),
  createWhatsappBroadcastList: (data) =>
    http.post("/whatsapp/broadcast-lists", data),
  updateWhatsappBroadcastList: (id, data) =>
    http.put(`/whatsapp/broadcast-lists/${encodeURIComponent(id)}`, data),
  deleteWhatsappBroadcastList: (id) =>
    http.delete(`/whatsapp/broadcast-lists/${encodeURIComponent(id)}`),
  updateNotificationSettings: (settings) =>
    http.patch("/auth/notification-settings", settings),
  uploadAvatar: (file) => {
    const formData = new FormData();
    formData.append("avatar", file);
    return http.post("/auth/avatar", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },
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
