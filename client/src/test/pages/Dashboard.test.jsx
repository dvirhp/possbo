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

const mockScrapeMyGroups = vi.fn();
const mockGetSavedGroups = vi.fn();
vi.mock('../../services/groupsService.js', () => ({
  groupsService: {
    scrapeMyGroups: (...args) => mockScrapeMyGroups(...args),
    getSavedGroups: (...args) => mockGetSavedGroups(...args),
  },
}));

vi.mock('../../assets/i18n', () => ({
  default: {
    dashboard: {
      title: 'Dashboard',
      myGroups: 'My Groups',
      description: 'Click to load',
      loadGroups: 'Load Groups',
      refreshGroups: 'Refresh Groups',
      loadingGroups: 'Loading...',
      groupsFound: (n) => `Found ${n} groups`,
      noGroupsFound: 'No groups found',
      searchPlaceholder: 'Search...',
    },
    list: { details: 'Details', noItems: 'No items', openLink: 'Open' },
    logout: 'Logout',
    errors: {
      generic: 'Error:',
      fbSessionRequired: 'Facebook session required',
    },
  },
}));

vi.mock('../../styles/dashboard.css', () => ({}));
vi.mock('../../styles/generic-list.css', () => ({}));

describe('Dashboard page', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    mockRefresh.mockClear();
    mockGetMe.mockClear();
    mockLogout.mockClear();
    mockScrapeMyGroups.mockClear();
    mockGetSavedGroups.mockClear();

    // Default: authenticated
    mockRefresh.mockResolvedValue({ data: { accessToken: 'tok' } });
    mockGetMe.mockResolvedValue({
      data: { id: '1', email: 'a@b.com', name: 'Test' },
    });
    mockGetSavedGroups.mockResolvedValue({
      data: { success: true, groups: [] },
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

    await renderDashboard();

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/');
    });
  });

  it('should render load groups button', async () => {
    await renderDashboard();

    await waitFor(() => {
      expect(screen.getByText(/Load Groups/)).toBeInTheDocument();
    });
  });

  it('should render logout button', async () => {
    await renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('Logout')).toBeInTheDocument();
    });
  });

  it('should show user name when authenticated', async () => {
    await renderDashboard();

    await waitFor(() => {
      expect(screen.getByText(/Test/)).toBeInTheDocument();
    });
  });

  it('should load and display groups on refresh click', async () => {
    mockScrapeMyGroups.mockResolvedValue({
      data: {
        success: true,
        groups: [
          { id: '1', name: 'Group A', url: 'https://fb.com/groups/a' },
          { id: '2', name: 'Group B', url: 'https://fb.com/groups/b' },
        ],
      },
    });

    await renderDashboard();
    await waitFor(() => {
      expect(screen.getByText(/Load Groups/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(/Load Groups/));

    await waitFor(() => {
      expect(screen.getByText('Group A')).toBeInTheDocument();
      expect(screen.getByText('Group B')).toBeInTheDocument();
    });
  });

  it('should show error when no groups found', async () => {
    mockScrapeMyGroups.mockResolvedValue({
      data: { success: false, groups: null },
    });

    await renderDashboard();
    await waitFor(() => {
      expect(screen.getByText(/Load Groups/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(/Load Groups/));

    await waitFor(() => {
      expect(screen.getByText('No groups found')).toBeInTheDocument();
    });
  });

  it('should show FB session error instead of redirecting', async () => {
    mockScrapeMyGroups.mockRejectedValue({
      response: { data: { error: 'FACEBOOK_SESSION_REQUIRED' } },
    });

    await renderDashboard();
    await waitFor(() => {
      expect(screen.getByText(/Load Groups/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(/Load Groups/));

    await waitFor(() => {
      expect(
        screen.getByText('Facebook session required'),
      ).toBeInTheDocument();
    });
  });

  it('should logout and navigate to login', async () => {
    mockLogout.mockResolvedValue({ data: { success: true } });

    await renderDashboard();
    await waitFor(() => {
      expect(screen.getByText('Logout')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Logout'));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/');
    });
  });

  it('should display groups count title after loading', async () => {
    mockScrapeMyGroups.mockResolvedValue({
      data: {
        success: true,
        groups: [
          { id: '1', name: 'G1' },
          { id: '2', name: 'G2' },
        ],
      },
    });

    await renderDashboard();
    await waitFor(() => {
      expect(screen.getByText(/Load Groups/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(/Load Groups/));

    await waitFor(() => {
      expect(screen.getByText('Found 2 groups')).toBeInTheDocument();
    });
  });
});
