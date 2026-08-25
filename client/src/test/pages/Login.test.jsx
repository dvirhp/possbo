import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

const mockLogin = vi.fn();
vi.mock('../../services/api.js', () => ({
  authAPI: {
    login: (...args) => mockLogin(...args),
  },
}));

const mockCheckAuth = vi.fn();
const mockSetUser = vi.fn();
const mockLoginSuccess = vi.fn();
const mockAppData = {
  user: null,
  authChecked: true,
  checkAuth: mockCheckAuth,
  setUser: mockSetUser,
  loginSuccess: mockLoginSuccess,
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
  default: ({ onVerify }) => {
    return <div data-testid="turnstile" onClick={() => onVerify('token-123')} />;
  },
}));

import Login from '../../pages/Login.jsx';

describe('Login page', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    mockLogin.mockClear();
    mockCheckAuth.mockClear();
    mockSetUser.mockClear();
    mockLoginSuccess.mockClear();
    // Default: not authenticated
    mockAppData.user = null;
    mockAppData.authChecked = true;
  });

  const renderLogin = () => {
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>,
    );
  };

  it('should render email and password fields', () => {
    renderLogin();
    expect(screen.getByPlaceholderText('אימייל')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('סיסמה')).toBeInTheDocument();
  });

  it('should render submit button', () => {
    renderLogin();
    expect(screen.getByText('התחבר')).toBeInTheDocument();
  });

  it('should render link to register page', () => {
    renderLogin();
    expect(screen.getByText('הירשם')).toBeInTheDocument();
  });

  it('should login successfully and set user', async () => {
    const mockUser = { id: '1', email: 'a@b.com', name: 'Test' };
    mockLogin.mockResolvedValue({
      data: { success: true, accessToken: 'tok', user: mockUser },
    });

    renderLogin();
    fireEvent.click(screen.getByTestId('turnstile'));
    fireEvent.change(screen.getByPlaceholderText('אימייל'), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByPlaceholderText('סיסמה'), { target: { value: 'password123' } });
    fireEvent.submit(document.querySelector('form'));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith('a@b.com', 'password123', 'token-123');
      expect(mockLoginSuccess).toHaveBeenCalledWith(mockUser);
    });
  });

  it('should show error on login failure', async () => {
    mockLogin.mockRejectedValue({
      response: { data: { error: 'Invalid email or password' } },
      userMessage: 'אימייל או סיסמה שגויים',
    });

    renderLogin();
    fireEvent.click(screen.getByTestId('turnstile'));
    fireEvent.change(screen.getByPlaceholderText('אימייל'), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByPlaceholderText('סיסמה'), { target: { value: 'wrong' } });
    fireEvent.submit(document.querySelector('form'));

    await waitFor(() => {
      expect(screen.getByText('אימייל או סיסמה שגויים')).toBeInTheDocument();
    });
  });

  it('should redirect to dashboard if already authenticated', async () => {
    mockAppData.user = { id: '1', email: 'a@b.com' };
    mockAppData.authChecked = true;

    renderLogin();

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard', { replace: true });
    });
  });

  it('should show loading state while checking auth', () => {
    mockAppData.authChecked = false;
    renderLogin();
    // When authChecked is false, the form should not be visible yet
    expect(screen.queryByPlaceholderText('אימייל')).not.toBeInTheDocument();
  });

  it('should disable button while submitting', async () => {
    // Never resolve — keep loading forever
    mockLogin.mockReturnValue(new Promise(() => {}));

    renderLogin();
    fireEvent.click(screen.getByTestId('turnstile'));
    fireEvent.change(screen.getByPlaceholderText('אימייל'), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByPlaceholderText('סיסמה'), { target: { value: 'pass123' } });
    fireEvent.submit(document.querySelector('form'));

    await waitFor(() => {
      expect(screen.getByText('מתחבר...')).toBeInTheDocument();
    });
  });
});
