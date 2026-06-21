import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

const mockRefresh = vi.fn();
const mockGetMe = vi.fn();
const mockLogout = vi.fn();
vi.mock('../../services/api.js', () => ({
  authAPI: {
    refresh: (...args) => mockRefresh(...args),
    getMe: (...args) => mockGetMe(...args),
    logout: (...args) => mockLogout(...args),
  },
}));

const mockGetPublicationHistory = vi.fn();
vi.mock('../../services/groupsService.js', () => ({
  groupsService: {
    getPublicationHistory: (...args) => mockGetPublicationHistory(...args),
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

vi.mock('../../styles/dashboard.css', () => ({}));

describe('Dashboard page', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    mockRefresh.mockClear();
    mockGetMe.mockClear();
    mockLogout.mockClear();
    mockGetPublicationHistory.mockClear();

    // Default: authenticated
    mockRefresh.mockResolvedValue({ data: { accessToken: 'tok' } });
    mockGetMe.mockResolvedValue({
      data: { id: '1', email: 'a@b.com', name: 'דביר' },
    });
    mockGetPublicationHistory.mockResolvedValue({
      data: { success: true, history: [] },
    });
  });

  const renderDashboard = async () => {
    vi.resetModules();
    const Dashboard = (await import('../../pages/Dashboard.jsx')).default;
    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    );
  };

  it('should redirect to login when not authenticated', async () => {
    mockRefresh.mockRejectedValue(new Error('No token'));
    mockGetMe.mockRejectedValue(new Error('No token'));

    await renderDashboard();

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/login');
    });
  });

  it('should render logout button', async () => {
    await renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('התנתק')).toBeInTheDocument();
    });
  });

  it('should show user name when authenticated', async () => {
    await renderDashboard();

    await waitFor(() => {
      expect(screen.getByText(/דביר/)).toBeInTheDocument();
    });
  });

  it('should render action cards', async () => {
    await renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('צור פוסט חדש')).toBeInTheDocument();
      expect(screen.getByText('הקבוצות שלי')).toBeInTheDocument();
    });
  });

  it('should show empty state when no posts', async () => {
    await renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('עדיין לא פרסמת פוסטים.')).toBeInTheDocument();
    });
  });

  it('should logout and navigate to landing', async () => {
    mockLogout.mockResolvedValue({ data: { success: true } });

    await renderDashboard();
    await waitFor(() => {
      expect(screen.getByText('התנתק')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('התנתק'));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/');
    });
  });

  it('should show recent posts when available', async () => {
    mockGetPublicationHistory.mockResolvedValue({
      data: {
        success: true,
        history: [
          {
            id: '1',
            group: { name: 'קבוצת טסט' },
            status: 'SUCCESS',
            post: { content: 'תוכן הפוסט' },
            publishedAt: '2026-06-21T10:00:00Z',
          },
        ],
      },
    });

    await renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('קבוצת טסט')).toBeInTheDocument();
      expect(screen.getByText('✓ פורסם')).toBeInTheDocument();
    });
  });
});
