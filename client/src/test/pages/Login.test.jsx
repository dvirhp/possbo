import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

const mockLogin = vi.fn();
const mockRefresh = vi.fn();
vi.mock('../../services/api.js', () => ({
  authAPI: {
    login: (...args) => mockLogin(...args),
    refresh: (...args) => mockRefresh(...args),
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

describe('Login page', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    mockLogin.mockClear();
    mockRefresh.mockClear();
    mockRefresh.mockRejectedValue(new Error('No token'));
  });

  const renderLogin = async () => {
    vi.resetModules();
    const Login = (await import('../../pages/Login.jsx')).default;
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>,
    );
  };

  it('should render email and password fields', async () => {
    await renderLogin();
    await waitFor(() => {
      expect(screen.getByPlaceholderText('אימייל')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('סיסמה')).toBeInTheDocument();
    });
  });

  it('should render submit button', async () => {
    await renderLogin();
    await waitFor(() => {
      expect(screen.getByText('🔑 התחבר')).toBeInTheDocument();
    });
  });

  it('should render link to register page', async () => {
    await renderLogin();
    await waitFor(() => {
      expect(screen.getByText('הירשם')).toBeInTheDocument();
    });
  });

  it('should login successfully', async () => {
    mockLogin.mockResolvedValue({
      data: { success: true, accessToken: 'tok', user: { id: '1', email: 'a@b.com' } },
    });

    await renderLogin();
    await waitFor(() => {
      expect(screen.getByPlaceholderText('אימייל')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByPlaceholderText('אימייל'), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByPlaceholderText('סיסמה'), { target: { value: 'password123' } });
    fireEvent.submit(document.querySelector('form'));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith('a@b.com', 'password123');
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard');
    });
  });

  it('should show error on login failure', async () => {
    mockLogin.mockRejectedValue({
      response: { data: { error: 'Invalid email or password' } },
    });

    await renderLogin();
    await waitFor(() => {
      expect(screen.getByPlaceholderText('אימייל')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByPlaceholderText('אימייל'), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByPlaceholderText('סיסמה'), { target: { value: 'wrong' } });
    fireEvent.submit(document.querySelector('form'));

    await waitFor(() => {
      expect(screen.getByText('Invalid email or password')).toBeInTheDocument();
    });
  });

  it('should redirect to dashboard if already logged in', async () => {
    mockRefresh.mockResolvedValue({ data: { accessToken: 'tok' } });

    await renderLogin();

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard', { replace: true });
    });
  });
});
