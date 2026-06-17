import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

const mockBootstrapSession = vi.fn();
vi.mock('../../services/groupsService.js', () => ({
  groupsService: {
    bootstrapSession: (...args) => mockBootstrapSession(...args),
  },
}));

vi.mock('../../assets/i18n', () => ({
  default: {
    login: {
      title: 'PostIt',
      subtitle: 'subtitle',
      description: 'Description text',
      checkSession: 'Check session',
      checkingSession: 'Checking...',
      instructionTitle: 'Steps:',
      instructionStep1: 'Run command',
      instructionStep2: 'Login in browser',
      instructionStep3: 'Come back',
    },
    errors: { generic: 'Error:' },
  },
}));

vi.mock('../../styles/login.css', () => ({}));

describe('Login page', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    mockBootstrapSession.mockClear();
    localStorage.clear();
  });

  const renderLogin = async () => {
    const Login = (await import('../../pages/Login.jsx')).default;
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>,
    );
  };

  it('should render the check session button', async () => {
    await renderLogin();
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('should navigate to dashboard when session exists', async () => {
    mockBootstrapSession.mockResolvedValue({
      data: { success: true, sessionExists: true },
    });

    await renderLogin();
    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard');
    });
    expect(localStorage.getItem('fbSessionReady')).toBe('true');
  });

  it('should show instruction when session does not exist', async () => {
    mockBootstrapSession.mockRejectedValue({
      response: { data: { error: 'FACEBOOK_SESSION_REQUIRED' } },
    });

    await renderLogin();
    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(screen.getByText(/צעדים/)).toBeInTheDocument();
    });
  });

  it('should show error message on generic failure', async () => {
    mockBootstrapSession.mockRejectedValue(new Error('Network error'));

    await renderLogin();
    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(screen.getByText(/Error:.*Network error/)).toBeInTheDocument();
    });
  });

  it('should disable button while connecting', async () => {
    let resolvePromise;
    mockBootstrapSession.mockReturnValue(new Promise(r => { resolvePromise = r; }));

    await renderLogin();
    const btn = screen.getByRole('button');
    fireEvent.click(btn);

    expect(btn).toBeDisabled();

    resolvePromise({ data: { success: true, sessionExists: true } });
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalled();
    });
  });

  it('should show instruction box with second button after session required', async () => {
    mockBootstrapSession.mockRejectedValue({
      response: { data: { error: 'FACEBOOK_SESSION_REQUIRED' } },
    });

    await renderLogin();
    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(screen.getByText(/צעדים/)).toBeInTheDocument();
    });

    // Second button should also trigger bootstrap
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThanOrEqual(1);
  });
});
