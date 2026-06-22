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

const mockGetJobs = vi.fn();
const mockGetSavedGroups = vi.fn();
const mockGetPublicationHistory = vi.fn();
const mockGetStats = vi.fn();
vi.mock('../../services/groupsService.js', () => ({
  groupsService: {
    getJobs: (...args) => mockGetJobs(...args),
    getSavedGroups: (...args) => mockGetSavedGroups(...args),
    getPublicationHistory: (...args) => mockGetPublicationHistory(...args),
    getStats: (...args) => mockGetStats(...args),
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
    mockGetJobs.mockClear();
    mockGetSavedGroups.mockClear();
    mockGetPublicationHistory.mockClear();
    mockGetStats.mockClear();

    // Default: authenticated
    mockRefresh.mockResolvedValue({ data: { accessToken: 'tok' } });
    mockGetMe.mockResolvedValue({
      data: { id: '1', email: 'a@b.com', name: 'דביר' },
    });
    mockGetJobs.mockResolvedValue({ data: { success: true, jobs: [] } });
    mockGetSavedGroups.mockResolvedValue({ data: { success: true, groups: [] } });
    mockGetPublicationHistory.mockResolvedValue({ data: { success: true, history: [] } });
    mockGetStats.mockResolvedValue({
      data: { success: true, stats: { scheduledCount: 0, groupsCount: 0, publishedCount: 0, groupStats: [] } },
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

  it('should render welcome message and logout', async () => {
    await renderDashboard();

    await waitFor(() => {
      expect(screen.getByText(/דביר/)).toBeInTheDocument();
      expect(screen.getByTitle('התנתק')).toBeInTheDocument();
    });
  });

  it('should render create campaign button', async () => {
    await renderDashboard();

    await waitFor(() => {
      expect(screen.getByText(/קמפיין חדש/)).toBeInTheDocument();
    });
  });

  it('should render all 5 tabs', async () => {
    await renderDashboard();

    await waitFor(() => {
      expect(screen.getAllByText('קמפיינים').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('קבוצות').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('פרסומים').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('סטטיסטיקה').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('הגדרות').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('should show empty campaigns state', async () => {
    await renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('אין קמפיינים מתוזמנים')).toBeInTheDocument();
    });
  });

  it('should switch to groups tab and show empty state', async () => {
    await renderDashboard();

    await waitFor(() => {
      expect(screen.getAllByText('קבוצות').length).toBeGreaterThanOrEqual(1);
    });
    fireEvent.click(screen.getAllByText('קבוצות')[0]);

    await waitFor(() => {
      expect(screen.getByText('אין קבוצות שמורות')).toBeInTheDocument();
    });
  });

  it('should show groups when available', async () => {
    mockGetSavedGroups.mockResolvedValue({
      data: { success: true, groups: [{ id: '1', name: 'קבוצת טסט', image: null }] },
    });

    await renderDashboard();

    await waitFor(() => {
      expect(screen.getAllByText('קבוצות').length).toBeGreaterThanOrEqual(1);
    });
    fireEvent.click(screen.getAllByText('קבוצות')[0]);

    await waitFor(() => {
      expect(screen.getByText('קבוצת טסט')).toBeInTheDocument();
    });
  });

  it('should show posts when switching to posts tab', async () => {
    mockGetPublicationHistory.mockResolvedValue({
      data: {
        success: true,
        history: [{
          id: '1',
          group: { name: 'קבוצת פרסום' },
          status: 'SUCCESS',
          post: { id: 'p1', content: 'תוכן הפוסט' },
          publishedAt: '2026-06-21T10:00:00Z',
        }],
      },
    });

    await renderDashboard();

    await waitFor(() => {
      expect(screen.getAllByText('פרסומים').length).toBeGreaterThanOrEqual(1);
    });
    fireEvent.click(screen.getAllByText('פרסומים')[0]);

    await waitFor(() => {
      expect(screen.getByText('קבוצת פרסום')).toBeInTheDocument();
      expect(screen.getByText('✓ פורסם')).toBeInTheDocument();
    });
  });

  it('should logout and navigate to landing', async () => {
    mockLogout.mockResolvedValue({ data: { success: true } });

    await renderDashboard();
    await waitFor(() => {
      expect(screen.getByTitle('התנתק')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTitle('התנתק'));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/');
    });
  });
});
