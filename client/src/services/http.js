import axios from "axios";
import { logClientError } from "./clientLogger";
import { getStoredAccessToken, setStoredAccessToken } from './tokenStore'

const API_BASE_URL = "/api";

const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true, // needed for refresh token cookie
  timeout: 30000, // 30s default timeout for regular requests
});

// Token management
export function setAccessToken(token) {
  setStoredAccessToken(token);
}

export function getAccessToken() {
  return getStoredAccessToken();
}

export function clearAccessToken() {
  setStoredAccessToken(null);
}

// Request interceptor - attach access token
api.interceptors.request.use((config) => {
  const token = getStoredAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor - auto-refresh on 401 + network error retry
let isRefreshing = false;
let refreshSubscribers = [];

function onRefreshed(newToken) {
  refreshSubscribers.forEach((cb) => cb(newToken));
  refreshSubscribers = [];
}

function onRefreshFailed(err) {
  refreshSubscribers.forEach((cb) => cb(null, err));
  refreshSubscribers = [];
}

// Retry logic for network errors (connection drops, timeouts)
function isNetworkError(error) {
  return (
    !error.response &&
    (error.code === "ECONNABORTED" ||
      error.code === "ERR_NETWORK" ||
      error.message?.includes("Network Error") ||
      error.message?.includes("timeout"))
  );
}

// Map technical errors to user-friendly Hebrew messages
function getUserFriendlyMessage(error) {
  if (!error.response) {
    if (error.code === "ECONNABORTED" || error.message?.includes("timeout"))
      return "הפעולה נמשכה יותר מדי זמן. נסה שוב.";
    if (
      error.code === "ERR_NETWORK" ||
      error.message?.includes("Network Error")
    )
      return "אין חיבור לשרת. בדוק את החיבור לאינטרנט.";
    return "שגיאה בלתי צפויה. נסה שוב מאוחר יותר.";
  }
  const status = error.response.status;
  const serverMsg = error.response.data?.error;
  const isLoginRequest = error.config?.url?.includes("/auth/login");
  // Known Hebrew server messages — pass through
  if (serverMsg && /[\u0590-\u05FF]/.test(serverMsg)) return serverMsg;
  if (status === 401 && isLoginRequest) return "האימייל או הסיסמה אינם נכונים.";
  // Map HTTP status codes
  if (status === 400) return serverMsg || "הנתונים שהוזנו אינם תקינים.";
  if (status === 401) return "יש להתחבר מחדש.";
  if (status === 403) return "אין הרשאה לבצע פעולה זו.";
  if (status === 404) return "הפריט המבוקש לא נמצא.";
  if (status === 409) return serverMsg || "פעולה זו כבר בוצעה.";
  if (status === 413) return "הקובץ גדול מדי.";
  if (status === 429)
    return serverMsg || "יותר מדי בקשות. נסה שוב בעוד מספר דקות.";
  if (status >= 500) return "שגיאת שרת. נסה שוב מאוחר יותר.";
  return serverMsg || "שגיאה בלתי צפויה. נסה שוב.";
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // ── Network error retry (up to 2 retries with backoff) ──
    if (isNetworkError(error) && !originalRequest._networkRetry && !originalRequest._noRetry) {
      const retryCount = originalRequest._retryCount || 0;
      if (retryCount < 2) {
        originalRequest._retryCount = retryCount + 1;
        // Exponential backoff: 1s, 3s
        const delay = (retryCount + 1) * 1000 + Math.random() * 1000;
        await new Promise((r) => setTimeout(r, delay));
        return api(originalRequest);
      }
      // Mark as network-retried so we don't retry forever
      originalRequest._networkRetry = true;
    }

    // ── 401 → token refresh ──
    if (
      error.response?.status === 401 &&
      !originalRequest._retry &&
      !originalRequest.url?.includes("/auth/refresh") &&
      !originalRequest.url?.includes("/auth/login") &&
      !originalRequest.url?.includes("/auth/register")
    ) {
      if (isRefreshing) {
        // Queue this request until refresh completes
        return new Promise((resolve, reject) => {
          refreshSubscribers.push((newToken, err) => {
            if (err) return reject(err);
            originalRequest.headers.Authorization = `Bearer ${newToken}`;
            resolve(api(originalRequest));
          });
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const res = await axios.post(
          `${API_BASE_URL}/auth/refresh`,
          {},
          { withCredentials: true, timeout: 10000 },
        );
        const newToken = res.data.accessToken;
        setAccessToken(newToken);
        onRefreshed(newToken);
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        clearAccessToken();
        onRefreshFailed(refreshError);
        // Session fully expired — redirect to login
        if (
          window.location.pathname !== "/login" &&
          window.location.pathname !== "/register"
        ) {
          window.location.href = "/login";
        }
        return Promise.reject(error);
      } finally {
        isRefreshing = false;
      }
    }

    // Attach user-friendly message
    error.userMessage = getUserFriendlyMessage(error);

    if (
      !originalRequest?.url?.includes("/client-logs") &&
      !originalRequest?._clientLogReported &&
      (error.response?.status >= 500 || isNetworkError(error))
    ) {
      originalRequest._clientLogReported = true;
      logClientError("api_request_failed", error, {
        source: `${originalRequest?.method?.toUpperCase() || "GET"} ${originalRequest?.url || ""}`,
        statusCode: error.response?.status,
      });
    }

    // If we still get a 401 after refresh attempt, redirect to login
    if (
      error.response?.status === 401 &&
      !originalRequest.url?.includes("/auth/refresh") &&
      !originalRequest.url?.includes("/auth/login") &&
      !originalRequest.url?.includes("/auth/register")
    ) {
      clearAccessToken();
      const p = window.location.pathname;
      if (p !== "/login" && p !== "/register" && p !== "/") {
        window.location.href = "/login";
        return new Promise(() => {}); // never resolve — page is navigating
      }
    }

    return Promise.reject(error);
  },
);

export default api;
