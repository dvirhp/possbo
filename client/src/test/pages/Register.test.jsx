import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

const mockRegister = vi.fn();
const mockVerifyEmail = vi.fn();
vi.mock('../../services/api.js', () => ({
  authAPI: {
    register: (...args) => mockRegister(...args),
    verifyEmail: (...args) => mockVerifyEmail(...args),
  },
}));

const mockCheckAuth = vi.fn();
const mockSetUser = vi.fn();
const mockAppData = {
  user: null,
  authChecked: true,
  checkAuth: mockCheckAuth,
  setUser: mockSetUser,
};

vi.mock('../../context/DataProvider', () => ({
  useAppData: () => mockAppData,
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
vi.mock('../../components/OAuthButtons', () => ({ default: () => <div data-testid="oauth-buttons" /> }));
vi.mock('../../components/Turnstile', () => ({
  default: ({ onVerify }) => <button data-testid="turnstile" onClick={() => onVerify('token-123')}>Verify</button>,
}));

import Register from '../../pages/Register.jsx';

describe('Register page', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    mockRegister.mockClear();
    mockVerifyEmail.mockClear();
    mockSetUser.mockClear();
    mockAppData.user = null;
    mockAppData.authChecked = true;
  });

  const renderRegister = () =>
    render(
      <MemoryRouter>
        <Register />
      </MemoryRouter>
    );

  it('renders registration form', () => {
    renderRegister();
    expect(screen.getByPlaceholderText(/אימייל/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/סיסמה/)).toBeInTheDocument();
  });

  it('redirects if already logged in', () => {
    mockAppData.user = { id: '1', email: 'a@b.com' };
    renderRegister();
    expect(mockNavigate).toHaveBeenCalledWith('/dashboard', { replace: true });
  });

  it('submit button is disabled without captcha and terms', () => {
    renderRegister();
    const submitBtn = screen.getByRole('button', { name: /הירשם/ });
    expect(submitBtn).toBeDisabled();
  });

  it('submit button enables after captcha and terms', async () => {
    renderRegister();
    // Complete captcha
    fireEvent.click(screen.getByTestId('turnstile'));
    // Agree to terms
    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);
    const submitBtn = screen.getByRole('button', { name: /הירשם/ });
    expect(submitBtn).not.toBeDisabled();
  });

  it('calls register API on valid submit', async () => {
    mockRegister.mockResolvedValue({ data: { requiresVerification: true } });
    renderRegister();
    fireEvent.click(screen.getByTestId('turnstile'));
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.change(screen.getByPlaceholderText(/אימייל/), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByPlaceholderText(/סיסמה/), { target: { value: '123456' } });
    fireEvent.change(screen.getByPlaceholderText(/תעודת זהות/), { target: { value: '123456789' } });
    const submitBtn = screen.getByRole('button', { name: /הירשם/ });
    fireEvent.click(submitBtn);
    await waitFor(() => {
      expect(mockRegister).toHaveBeenCalled();
    });
  });

  it('shows error for short password', async () => {
    renderRegister();
    fireEvent.click(screen.getByTestId('turnstile'));
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.change(screen.getByPlaceholderText(/אימייל/), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByPlaceholderText(/סיסמה/), { target: { value: '123' } });
    fireEvent.change(screen.getByPlaceholderText(/תעודת זהות/), { target: { value: '123456789' } });
    const submitBtn = screen.getByRole('button', { name: /הירשם/ });
    fireEvent.click(submitBtn);
    await waitFor(() => {
      expect(screen.getByText(/לפחות 6 תווים/)).toBeInTheDocument();
    });
  });

  it('renders OAuth buttons', () => {
    renderRegister();
    expect(screen.getByTestId('oauth-buttons')).toBeInTheDocument();
  });

  it('renders turnstile component', () => {
    renderRegister();
    expect(screen.getByTestId('turnstile')).toBeInTheDocument();
  });
});
