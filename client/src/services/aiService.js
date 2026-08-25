import api from './http';

export const aiService = {
  generatePost(data) {
    return api.post('/ai/generate-post', data);
  },
  transformPost(data) {
    return api.post('/ai/transform-post', data);
  },
};
