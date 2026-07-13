import api from "./http";

export const publishService = {
  publish: (
    groupUrl,
    text,
    images,
    groupName,
    anonymous = false,
    location = "",
    title = "",
  ) => {
    const formData = new FormData();
    formData.append("groupUrl", groupUrl);
    formData.append("text", text);
    if (title) {
      formData.append("title", title);
    }
    if (groupName) {
      formData.append("groupName", groupName);
    }
    if (anonymous) {
      formData.append("anonymous", "true");
    }
    if (location) {
      formData.append("location", location);
    }
    // Support array of images or single file
    if (Array.isArray(images)) {
      for (const img of images) {
        formData.append("images", img);
      }
    } else if (images) {
      formData.append("images", images);
    }
    return api.post("/publish", formData, {
      headers: { "Content-Type": "multipart/form-data" },
      timeout: 120000,
    });
  },

  getHistory: (groupUrl) => {
    const params = groupUrl ? `?groupUrl=${encodeURIComponent(groupUrl)}` : "";
    return api.get(`/publish/history${params}`);
  },

  publishToProfile: (text, images, location = "", title = "") => {
    const formData = new FormData();
    formData.append("text", text);
    if (title) formData.append("title", title);
    if (location) formData.append("location", location);
    formData.append("targetType", "PROFILE");
    if (Array.isArray(images)) {
      for (const img of images) {
        formData.append("images", img);
      }
    } else if (images) {
      formData.append("images", images);
    }
    return api.post("/publish/profile", formData, {
      headers: { "Content-Type": "multipart/form-data" },
      timeout: 120000,
    });
  },
};
