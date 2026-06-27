import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPost = vi.fn();
vi.mock('../../services/http.js', () => ({
  default: {
    get: vi.fn(),
    post: (...args) => mockPost(...args),
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
  },
  setAccessToken: vi.fn(),
  getAccessToken: vi.fn(),
  clearAccessToken: vi.fn(),
}));

import {
  loginWithGoogle,
  loginWithFacebook,
  loginWithGithub,
  loginWithLinkedin,
  loginWithApple,
} from '../../services/oauthService.js';

describe('oauthService', () => {
  beforeEach(() => {
    mockPost.mockClear();
    delete window.google;
    delete window.FB;
  });

  describe('loginWithGoogle', () => {
    it('rejects when Google SDK not loaded', async () => {
      await expect(loginWithGoogle()).rejects.toThrow('Google SDK not loaded');
    });

    it('calls Google SDK initialize', () => {
      const mockInitialize = vi.fn();
      const mockPrompt = vi.fn();
      window.google = {
        accounts: {
          id: {
            initialize: mockInitialize,
            prompt: mockPrompt,
          },
        },
      };

      loginWithGoogle('login').catch(() => {});
      expect(mockInitialize).toHaveBeenCalled();
    });
  });

  describe('loginWithFacebook', () => {
    it('loads FB SDK and calls FB.login', async () => {
      // Simulate FB already loaded
      window.FB = {
        init: vi.fn(),
        login: vi.fn((cb) => cb({ authResponse: null })),
      };

      await expect(loginWithFacebook('login')).rejects.toThrow('Facebook login cancelled');
    });

    it('resolves on successful FB login', async () => {
      window.FB = {
        init: vi.fn(),
        login: vi.fn((cb) => cb({ authResponse: { accessToken: 'fb-tok' } })),
      };
      mockPost.mockResolvedValue({ data: { success: true, accessToken: 'jwt' } });

      const result = await loginWithFacebook('login');
      expect(result.success).toBe(true);
      expect(mockPost).toHaveBeenCalledWith('/api/oauth/facebook', {
        accessToken: 'fb-tok',
        mode: 'login',
      });
    });
  });

  describe('loginWithGithub', () => {
    it('opens popup window', () => {
      const mockOpen = vi.fn().mockReturnValue({ closed: true });
      window.open = mockOpen;

      loginWithGithub('login').catch(() => {});

      expect(mockOpen).toHaveBeenCalledWith(
        expect.stringContaining('github.com/login/oauth/authorize'),
        'github-oauth',
        expect.any(String)
      );
    });

    it('rejects when popup is closed', async () => {
      vi.useFakeTimers();
      window.open = vi.fn().mockReturnValue({ closed: true });

      const promise = loginWithGithub('login');
      vi.advanceTimersByTime(600);

      await expect(promise).rejects.toThrow('GitHub login cancelled');
      vi.useRealTimers();
    });
  });

  describe('loginWithLinkedin', () => {
    it('opens popup with linkedin URL', () => {
      const mockOpen = vi.fn().mockReturnValue({ closed: true });
      window.open = mockOpen;

      loginWithLinkedin('register').catch(() => {});

      expect(mockOpen).toHaveBeenCalledWith(
        expect.stringContaining('linkedin.com/oauth/v2/authorization'),
        'linkedin-oauth',
        expect.any(String)
      );
    });
  });

  describe('loginWithApple', () => {
    it('opens popup with apple URL', () => {
      const mockOpen = vi.fn().mockReturnValue({ closed: true });
      window.open = mockOpen;

      loginWithApple('login').catch(() => {});

      expect(mockOpen).toHaveBeenCalledWith(
        expect.stringContaining('appleid.apple.com/auth/authorize'),
        'apple-oauth',
        expect.any(String)
      );
    });

    it('rejects when popup is closed', async () => {
      vi.useFakeTimers();
      window.open = vi.fn().mockReturnValue({ closed: true });

      const promise = loginWithApple('login');
      vi.advanceTimersByTime(600);

      await expect(promise).rejects.toThrow('Apple login cancelled');
      vi.useRealTimers();
    });
  });
});
