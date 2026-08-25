import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
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

  it('shows error when submitting blank email', async () => {
    renderPage();
    // Set email to blank spaces to bypass HTML required validation
    fireEvent.change(screen.getByPlaceholderText(/האימייל/), { target: { value: '   ' } });
    fireEvent.submit(screen.getByRole('button', { name: /שלח קוד איפוס/ }).closest('form'));
    await waitFor(() => {
      expect(screen.getByText(/יש להזין אימייל/)).toBeInTheDocument();
    });
  });

  it('shows error when API call fails', async () => {
    mockForgotPassword.mockRejectedValue({ userMessage: 'שגיאה בשליחת הקוד' });
    renderPage();
    fireEvent.change(screen.getByPlaceholderText(/האימייל/), { target: { value: 'test@test.com' } });
    fireEvent.click(screen.getByRole('button', { name: /שלח קוד איפוס/ }));
    await waitFor(() => {
      expect(screen.getByText(/שגיאה/)).toBeInTheDocument();
    });
  });

  it('shows loading state while sending code', async () => {
    let resolvePromise;
    mockForgotPassword.mockReturnValue(new Promise((resolve) => { resolvePromise = resolve; }));
    renderPage();
    fireEvent.change(screen.getByPlaceholderText(/האימייל/), { target: { value: 'test@test.com' } });
    fireEvent.click(screen.getByRole('button', { name: /שלח קוד איפוס/ }));
    
    // Button should show loading state
    expect(screen.getByRole('button', { name: /שולח/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /שולח/ })).toBeDisabled();
    
    await act(async () => {
      resolvePromise({ data: { success: true } });
    });
  });

  it('shows step 2 header after sending code', async () => {
    mockForgotPassword.mockResolvedValue({ data: { success: true } });
    renderPage();
    fireEvent.change(screen.getByPlaceholderText(/האימייל/), { target: { value: 'user@test.com' } });
    fireEvent.click(screen.getByRole('button', { name: /שלח קוד איפוס/ }));
    await waitFor(() => {
      expect(screen.getByText(/איפוס סיסמה/)).toBeInTheDocument();
    });
  });

  it('shows password inputs on step 2', async () => {
    mockForgotPassword.mockResolvedValue({ data: { success: true } });
    renderPage();
    fireEvent.change(screen.getByPlaceholderText(/האימייל/), { target: { value: 'user@test.com' } });
    fireEvent.click(screen.getByRole('button', { name: /שלח קוד איפוס/ }));
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/סיסמה חדשה \(לפחות/)).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/אימות סיסמה/)).toBeInTheDocument();
    });
  });

  it('shows error for password shorter than 6 chars on step 2', async () => {
    mockForgotPassword.mockResolvedValue({ data: { success: true } });
    renderPage();
    fireEvent.change(screen.getByPlaceholderText(/האימייל/), { target: { value: 'user@test.com' } });
    fireEvent.click(screen.getByRole('button', { name: /שלח קוד איפוס/ }));
    
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/סיסמה חדשה \(לפחות/)).toBeInTheDocument();
    });

    // Fill in short password
    fireEvent.change(screen.getByPlaceholderText(/סיסמה חדשה \(לפחות/), { target: { value: '123' } });
    fireEvent.change(screen.getByPlaceholderText(/אימות סיסמה/), { target: { value: '123' } });
    
    // Fill OTP circles with values — the OtpInput component manages state internally
    const otpInputs = document.querySelectorAll('.otp-circle');
    otpInputs.forEach((input, i) => {
      fireEvent.change(input, { target: { value: String(i + 1) } });
    });

    // Submit the form
    const form = screen.getByPlaceholderText(/סיסמה חדשה \(לפחות/).closest('form');
    fireEvent.submit(form);

    await waitFor(() => {
      expect(screen.getByText(/לפחות 6 תווים/)).toBeInTheDocument();
    });
  });

  it('shows error when passwords do not match on step 2', async () => {
    mockForgotPassword.mockResolvedValue({ data: { success: true } });
    renderPage();
    fireEvent.change(screen.getByPlaceholderText(/האימייל/), { target: { value: 'user@test.com' } });
    fireEvent.click(screen.getByRole('button', { name: /שלח קוד איפוס/ }));
    
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/סיסמה חדשה \(לפחות/)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText(/סיסמה חדשה \(לפחות/), { target: { value: 'password123' } });
    fireEvent.change(screen.getByPlaceholderText(/אימות סיסמה/), { target: { value: 'different456' } });
    
    const otpInputs = document.querySelectorAll('.otp-circle');
    otpInputs.forEach((input, i) => {
      fireEvent.change(input, { target: { value: String(i + 1) } });
    });

    const form = screen.getByPlaceholderText(/סיסמה חדשה \(לפחות/).closest('form');
    fireEvent.submit(form);

    await waitFor(() => {
      expect(screen.getByText(/לא תואמות/)).toBeInTheDocument();
    });
  });

  it('shows success message after successful reset', async () => {
    mockForgotPassword.mockResolvedValue({ data: { success: true } });
    mockResetPassword.mockResolvedValue({ data: { success: true } });
    renderPage();
    
    fireEvent.change(screen.getByPlaceholderText(/האימייל/), { target: { value: 'user@test.com' } });
    fireEvent.click(screen.getByRole('button', { name: /שלח קוד איפוס/ }));
    
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/סיסמה חדשה \(לפחות/)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText(/סיסמה חדשה \(לפחות/), { target: { value: 'newpassword123' } });
    fireEvent.change(screen.getByPlaceholderText(/אימות סיסמה/), { target: { value: 'newpassword123' } });
    
    const otpInputs = document.querySelectorAll('.otp-circle');
    otpInputs.forEach((input, i) => {
      fireEvent.change(input, { target: { value: String(i + 1) } });
    });

    const form = screen.getByPlaceholderText(/סיסמה חדשה \(לפחות/).closest('form');
    fireEvent.submit(form);

    await waitFor(() => {
      expect(screen.getByText(/אופסה בהצלחה/)).toBeInTheDocument();
    });
  });
});
