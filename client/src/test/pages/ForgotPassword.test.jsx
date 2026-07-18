import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

const mockForgotPassword = vi.fn();
const mockResetPassword = vi.fn();
vi.mock('../../services/api.js', () => ({
  authAPI: {
    forgotPassword: (...args) => mockForgotPassword(...args),
    resetPassword: (...args) => mockResetPassword(...args),
  },
}));

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

vi.mock('../../styles/auth.css', () => ({}));

import ForgotPassword from '../../pages/ForgotPassword.jsx';

describe('ForgotPassword page', () => {
  beforeEach(() => {
    mockForgotPassword.mockClear();
    mockResetPassword.mockClear();
    mockNavigate.mockClear();
  });

  const renderPage = () =>
    render(
      <MemoryRouter>
        <ForgotPassword />
      </MemoryRouter>
    );

  it('renders email input on step 1', () => {
    renderPage();
    expect(screen.getByPlaceholderText(/אימייל/)).toBeInTheDocument();
  });

  it('renders send code button', () => {
    renderPage();
    expect(screen.getByRole('button', { name: /שלח קוד איפוס/ })).toBeInTheDocument();
  });

  it('renders page header', () => {
    renderPage();
    expect(screen.getByText(/שכחת סיסמה/)).toBeInTheDocument();
  });

  it('advances to step 2 after sending code', async () => {
    mockForgotPassword.mockResolvedValue({ data: { success: true } });
    renderPage();
    fireEvent.change(screen.getByPlaceholderText(/האימייל/), { target: { value: 'test@test.com' } });
    fireEvent.click(screen.getByRole('button', { name: /שלח קוד איפוס/ }));
    await waitFor(() => {
      // OTP component renders 6 individual digit inputs
      const otpInputs = document.querySelectorAll('.otp-circle');
      expect(otpInputs.length).toBe(6);
    });
  });

  it('renders back link to login', () => {
    renderPage();
    expect(screen.getByText(/חזרה להתחברות/)).toBeInTheDocument();
  });
});
