import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

const mockLogout = vi.fn();
const mockEnsureFresh = vi.fn();
const mockForceRefresh = vi.fn();
const mockUpdateGroups = vi.fn();

const mockAppData = {
  user: { id: '1', email: 'a@b.com', name: 'דביר' },
  authChecked: true,
  logout: mockLogout,
  ensureFresh: mockEnsureFresh,
  forceRefresh: mockForceRefresh,
  campaigns: [],
  groups: [],
  jobs: [],
  posts: [],
  stats: { scheduledCount: 0, groupsCount: 0, publishedCount: 0, groupStats: [] },
  setStats: vi.fn(),
  updateGroups: mockUpdateGroups,
  refreshing: false,
  dataReady: true,
};

vi.mock('../../context/DataProvider', () => ({
  useAppData: () => mockAppData,
}));

vi.mock('../../services/groupsService.js', () => ({
  groupsService: {
    getJobs: vi.fn().mockResolvedValue({ data: { success: true, jobs: [] } }),
    getSavedGroups: vi.fn().mockResolvedValue({ data: { success: true, groups: [] } }),
    getPublicationHistory: vi.fn().mockResolvedValue({ data: { success: true, history: [] } }),
    getStats: vi.fn().mockResolvedValue({ data: { success: true, stats: {} } }),
    getDashboardKpis: vi.fn().mockResolvedValue({ data: { kpis: {} } }),
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

import Dashboard from '../../pages/Dashboard.jsx';

describe('Dashboard page', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    mockLogout.mockClear();
    mockEnsureFresh.mockClear();
    mockForceRefresh.mockClear();
    // Reset to authenticated state
    mockAppData.user = { id: '1', email: 'a@b.com', name: 'דביר' };
    mockAppData.authChecked = true;
    mockAppData.campaigns = [];
    mockAppData.groups = [];
    mockAppData.jobs = [];
    mockAppData.posts = [];
    mockAppData.stats = { scheduledCount: 0, groupsCount: 0, publishedCount: 0, groupStats: [] };
    mockAppData.dataReady = true;
  });

  const renderDashboard = () => {
    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    );
  };

  it('should redirect to login when not authenticated', async () => {
    mockAppData.user = null;
    mockAppData.authChecked = true;

    renderDashboard();

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/login');
    });
  });

  it('should render welcome message and logout', async () => {
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText(/דביר/)).toBeInTheDocument();
      expect(screen.getByTitle('התנתק')).toBeInTheDocument();
    });
  });

  it('should render create campaign button', async () => {
    renderDashboard();

    await waitFor(() => {
      expect(screen.getAllByText(/קמפיין חדש/).length).toBeGreaterThanOrEqual(1);
    });
  });

  it('should render all 5 tabs', async () => {
    renderDashboard();

    await waitFor(() => {
      expect(screen.getAllByText('קמפיינים').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('קבוצות').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('פרסומים').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('סטטיסטיקה').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('הגדרות').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('should show empty campaigns state', async () => {
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('אין קמפיינים')).toBeInTheDocument();
    });
  });

  it('should switch to groups tab and show empty state', async () => {
    renderDashboard();

    await waitFor(() => {
      expect(screen.getAllByText('קבוצות').length).toBeGreaterThanOrEqual(1);
    });
    fireEvent.click(screen.getAllByText('קבוצות')[0]);

    await waitFor(() => {
      expect(screen.getByText('אין קבוצות שמורות')).toBeInTheDocument();
    });
  });

  it('should show groups when available', async () => {
    mockAppData.groups = [{ id: '1', name: 'קבוצת טסט', image: null }];

    renderDashboard();

    await waitFor(() => {
      expect(screen.getAllByText('קבוצות').length).toBeGreaterThanOrEqual(1);
    });
    fireEvent.click(screen.getAllByText('קבוצות')[0]);

    await waitFor(() => {
      expect(screen.getByText('קבוצת טסט')).toBeInTheDocument();
    });
  });

  it('should show posts when switching to posts tab', async () => {
    mockAppData.posts = [{
      id: '1',
      group: { name: 'קבוצת פרסום' },
      status: 'SUCCESS',
      post: { id: 'p1', content: 'תוכן הפוסט' },
      publishedAt: '2026-06-21T10:00:00Z',
    }];

    renderDashboard();

    await waitFor(() => {
      expect(screen.getAllByText('פרסומים').length).toBeGreaterThanOrEqual(1);
    });
    fireEvent.click(screen.getAllByText('פרסומים')[0]);

    await waitFor(() => {
      expect(screen.getByText(/קבוצת פרסום/)).toBeInTheDocument();
      expect(screen.getByText(/✓ פורסם/)).toBeInTheDocument();
    });
  });

  it('should logout and navigate to landing', async () => {
    mockLogout.mockResolvedValue();

    renderDashboard();
    await waitFor(() => {
      expect(screen.getByTitle('התנתק')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTitle('התנתק'));

    // Confirmation dialog appears — click confirm button
    await waitFor(() => {
      expect(screen.getByText('בטוח!')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('בטוח!'));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/');
    });
  });

  it('should show campaigns with data', async () => {
    mockAppData.campaigns = [
      { id: 'c1', title: 'קמפיין ראשון', content: 'תוכן', status: 'ACTIVE', createdAt: '2026-06-20T10:00:00Z', groupNames: ['קבוצה 1'] },
    ];

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('קמפיין ראשון')).toBeInTheDocument();
    });
  });

  it('should render stats tab with labels', async () => {
    mockAppData.stats = { scheduledCount: 5, groupsCount: 3, publishedCount: 12, groupStats: [] };

    renderDashboard();

    fireEvent.click(screen.getAllByText('סטטיסטיקה')[0]);

    await waitFor(() => {
      expect(screen.getByText('סה״כ פרסומים')).toBeInTheDocument();
      expect(screen.getByText('קבוצות פעילות')).toBeInTheDocument();
      expect(screen.getByText('ממתינים לפרסום')).toBeInTheDocument();
    });
  });

  it('should show loader when data is not ready', () => {
    mockAppData.dataReady = false;

    renderDashboard();

    // When dataReady is false, the campaigns panel should not be visible
    expect(screen.queryByText('אין קמפיינים')).not.toBeInTheDocument();
  });
});
