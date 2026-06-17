import api from "./http";

export const screenshotService = {
  capture: (url) =>
    api.get(`/screenshot?url=${encodeURIComponent(url)}`, { timeout: 120000 }),
};
