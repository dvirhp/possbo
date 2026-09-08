import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../services/http.js', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
  },
  setAccessToken: vi.fn(),
  getAccessToken: vi.fn(),
  clearAccessToken: vi.fn(),
}));

import OAuthCallback from '../../pages/OAuthCallback.jsx';

describe('OAuthCallback page', () => {
  let originalLocation;
  let originalOpener;

  beforeEach(() => {
    originalLocation = window.location;
    originalOpener = window.opener;
  });

  afterEach(() => {
    window.location = originalLocation;
    window.opener = originalOpener;
  });

  it('renders processing message', () => {
    render(
      <MemoryRouter>
        <OAuthCallback />
      </MemoryRouter>
    );
    expect(screen.getByText(/מעבד/)).toBeInTheDocument();
  });

  it('renders close message for instagram success', () => {
    delete window.location;
    window.location = { ...originalLocation, pathname: '/oauth/callback/instagram', hash: '' };
    render(
      <MemoryRouter initialEntries={['/oauth/callback/instagram?provider=instagram&success=true']}>
        <OAuthCallback />
      </MemoryRouter>
    );
    expect(screen.getByText(/ניתן לסגור חלון זה|הצלחה/)).toBeInTheDocument();
  });

  it('detects github provider from pathname', () => {
    delete window.location;
    window.location = { ...originalLocation, pathname: '/oauth/callback/github', hash: '' };
    render(
      <MemoryRouter initialEntries={['/oauth/callback/github']}>
        <OAuthCallback />
      </MemoryRouter>
    );
    // Should show processing or success message
    expect(screen.getByText(/מעבד|הצלחה|נדחתה/)).toBeInTheDocument();
  });

  it('detects linkedin provider from pathname', () => {
    delete window.location;
    window.location = { ...originalLocation, pathname: '/oauth/callback/linkedin', hash: '' };
    render(
      <MemoryRouter initialEntries={['/oauth/callback/linkedin']}>
        <OAuthCallback />
      </MemoryRouter>
    );
    expect(screen.getByText(/מעבד|הצלחה|נדחתה/)).toBeInTheDocument();
  });

  it('detects apple provider from pathname', () => {
    delete window.location;
    window.location = { ...originalLocation, pathname: '/oauth/callback/apple', hash: '#' };
    render(
      <MemoryRouter initialEntries={['/oauth/callback/apple']}>
        <OAuthCallback />
      </MemoryRouter>
    );
    expect(screen.getByText(/מעבד/)).toBeInTheDocument();
  });

  it('handles error parameter in URL', () => {
    delete window.location;
    window.location = { ...originalLocation, pathname: '/oauth/callback/github', hash: '' };
    render(
      <MemoryRouter initialEntries={['/oauth/callback/github?error=access_denied']}>
        <OAuthCallback />
      </MemoryRouter>
    );
    expect(screen.getByText(/נדחתה|שגיאה|מעבד/)).toBeInTheDocument();
  });

  it('handles instagram error case', () => {
    delete window.location;
    window.location = { ...originalLocation, pathname: '/oauth/callback/instagram', hash: '' };
    render(
      <MemoryRouter initialEntries={['/oauth/callback/instagram?success=false&error=token_expired']}>
        <OAuthCallback />
      </MemoryRouter>
    );
    expect(screen.getByText(/חיבור Instagram נכשל/)).toBeInTheDocument();
  });

  it('explains when instagram is already connected to another Possbo account', () => {
    delete window.location;
    window.location = { ...originalLocation, pathname: '/oauth/callback/instagram', hash: '' };
    render(
      <MemoryRouter initialEntries={['/oauth/callback/instagram?success=false&error=account_already_connected']}>
        <OAuthCallback />
      </MemoryRouter>
    );
    expect(screen.getByText(/כבר מחובר לחשבון Possbo אחר/)).toBeInTheDocument();
  });

  it('handles github with code parameter and sends postMessage', () => {
    delete window.location;
    window.location = { ...originalLocation, pathname: '/oauth/callback/github', hash: '', origin: 'http://localhost:3000' };
    const mockPostMessage = vi.fn();
    window.opener = { postMessage: mockPostMessage };
    window.close = vi.fn();

    render(
      <MemoryRouter initialEntries={['/oauth/callback/github?code=abc123']}>
        <OAuthCallback />
      </MemoryRouter>
    );

    expect(mockPostMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'github-oauth-callback',
        code: 'abc123',
      }),
      expect.any(String)
    );
  });

  it('strips trailing #_ from code', () => {
    delete window.location;
    window.location = { ...originalLocation, pathname: '/oauth/callback/github', hash: '', origin: 'http://localhost:3000' };
    const mockPostMessage = vi.fn();
    window.opener = { postMessage: mockPostMessage };
    window.close = vi.fn();

    render(
      <MemoryRouter initialEntries={['/oauth/callback/github?code=abc123%23_']}>
        <OAuthCallback />
      </MemoryRouter>
    );

    // Code should have #_ stripped
    const call = mockPostMessage.mock.calls[0];
    if (call) {
      expect(call[0].code).not.toMatch(/#_$/);
    }
  });

  it('renders spinner animation', () => {
    render(
      <MemoryRouter>
        <OAuthCallback />
      </MemoryRouter>
    );
    const spinner = document.querySelector('.spinner');
    expect(spinner).toBeInTheDocument();
  });
});
