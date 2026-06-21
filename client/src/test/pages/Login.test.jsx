import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

const mockRegister = vi.fn();
const mockLogin = vi.fn();
const mockRefresh = vi.fn();
vi.mock('../../services/api.js', () => ({
  authAPI: {
    register: (...args) => mockRegister(...args),
    login: (...args) => mockLogin(...args),
    refresh: (...args) => mockRefresh(...args),
  },
}));

// Mock http.js to prevent real axios interceptor setup
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

vi.mock('../../assets/i18n', () => ({
  default: {
    login: {
      title: 'PostIt',
      subtitle: 'subtitle',
      loginTab: 'Login',
      registerTab: 'Register',
      emailPlaceholder: 'Email',
      passwordPlaceholder: 'Password',
      namePlaceholder: 'Name',
      loginBtn: 'Login',
      registerBtn: 'Register',
      facebookCredentialsLabel: 'Facebook Credentials',
      facebookAppIdPlaceholder: 'Facebook App ID',
      facebookAppSecretPlaceholder: 'Facebook App Secret',
    },
    errors: { generic: 'Error:' },
  },
}));

vi.mock('../../styles/login.css', () => ({}));

describe('Login page', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    mockRegister.mockClear();
    mockLogin.mockClear();
    mockRefresh.mockClear();
    // Default: not logged in
    mockRefresh.mockRejectedValue(new Error('No token'));
  });

  const renderLogin = async () => {
    const Login = (await import('../../pages/Login.jsx')).default;
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>,
    );
  };

  it('should render login tab by default', async () => {
    await renderLogin();
    expect(screen.getByPlaceholderText('Email')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Password')).toBeInTheDocument();
    // No name or FB fields in login mode
    expect(screen.queryByPlaceholderText('Name')).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Facebook App ID')).not.toBeInTheDocument();
  });

  it('should switch to register tab and show FB fields', async () => {
    await renderLogin();
    fireEvent.click(screen.getByText('Register'));

    expect(screen.getByPlaceholderText('Name')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Facebook App ID')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Facebook App Secret')).toBeInTheDocument();
  });

  it('should login successfully', async () => {
    mockLogin.mockResolvedValue({
      data: { success: true, accessToken: 'tok', user: { id: '1', email: 'a@b.com' } },
    });

    await renderLogin();
    fireEvent.change(screen.getByPlaceholderText('Email'), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'password123' } });

    // Submit the form directly
    const form = document.querySelector('form');
    fireEvent.submit(form);

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith('a@b.com', 'password123');
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard');
    });
  });

  it('should register successfully', async () => {
    mockRegister.mockResolvedValue({
      data: { success: true, accessToken: 'tok', user: { id: '1', email: 'a@b.com' } },
    });

    await renderLogin();
    fireEvent.click(screen.getByText('Register'));
    fireEvent.change(screen.getByPlaceholderText('Name'), { target: { value: 'Test' } });
    fireEvent.change(screen.getByPlaceholderText('Email'), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'pass123' } });
    fireEvent.change(screen.getByPlaceholderText('Facebook App ID'), { target: { value: 'fb-id' } });
    fireEvent.change(screen.getByPlaceholderText('Facebook App Secret'), { target: { value: 'fb-sec' } });
    fireEvent.submit(document.querySelector('form'));

    await waitFor(() => {
      expect(mockRegister).toHaveBeenCalledWith('a@b.com', 'pass123', 'Test', 'fb-id', 'fb-sec');
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard');
    });
  });

  it('should show error on login failure', async () => {
    mockLogin.mockRejectedValue({
      response: { data: { error: 'Invalid email or password' } },
    });

    await renderLogin();
    fireEvent.change(screen.getByPlaceholderText('Email'), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'wrong' } });
    fireEvent.submit(document.querySelector('form'));

    await waitFor(() => {
      expect(screen.getByText('Invalid email or password')).toBeInTheDocument();
    });
  });

  it('should redirect to dashboard if already logged in', async () => {
    mockRefresh.mockResolvedValue({ data: { accessToken: 'tok' } });

    await renderLogin();

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard');
    });
  });
});
