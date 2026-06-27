import { describe, it, expect, vi } from 'vitest';
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
  it('renders processing message', () => {
    render(
      <MemoryRouter>
        <OAuthCallback />
      </MemoryRouter>
    );
    expect(screen.getByText(/מעבד/)).toBeInTheDocument();
  });

  it('renders close message', () => {
    render(
      <MemoryRouter>
        <OAuthCallback />
      </MemoryRouter>
    );
    expect(screen.getByText(/ניתן לסגור חלון זה/)).toBeInTheDocument();
  });
});
