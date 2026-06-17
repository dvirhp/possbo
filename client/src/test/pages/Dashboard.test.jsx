import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

const mockScrapeMyGroups = vi.fn();
vi.mock('../../services/groupsService.js', () => ({
  groupsService: {
    scrapeMyGroups: (...args) => mockScrapeMyGroups(...args),
  },
}));

vi.mock('../../assets/i18n', () => ({
  default: {
    dashboard: {
      title: 'Dashboard',
      myGroups: 'My Groups',
      description: 'Click to load',
      loadGroups: 'Load Groups',
      loadingGroups: 'Loading...',
      groupsFound: (n) => `Found ${n} groups`,
      noGroupsFound: 'No groups found',
      searchPlaceholder: 'Search...',
    },
    list: { details: 'Details', noItems: 'No items', openLink: 'Open' },
    logout: 'Logout',
    errors: { generic: 'Error:' },
  },
}));

vi.mock('../../styles/dashboard.css', () => ({}));
vi.mock('../../styles/generic-list.css', () => ({}));

describe('Dashboard page', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    mockScrapeMyGroups.mockClear();
    localStorage.clear();
    localStorage.setItem('fbSessionReady', 'true');
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

  it('should redirect to login when no session', async () => {
    localStorage.removeItem('fbSessionReady');
    await renderDashboard();

    expect(mockNavigate).toHaveBeenCalledWith('/');
  });

  it('should render load groups button', async () => {
    await renderDashboard();
    expect(screen.getByText(/Load Groups/)).toBeInTheDocument();
  });

  it('should render logout button', async () => {
    await renderDashboard();
    expect(screen.getByText('Logout')).toBeInTheDocument();
  });

  it('should load and display groups on button click', async () => {
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
    fireEvent.click(screen.getByText(/Load Groups/));

    await waitFor(() => {
      expect(screen.getByText('No groups found')).toBeInTheDocument();
    });
  });

  it('should redirect to login on FACEBOOK_SESSION_REQUIRED error', async () => {
    mockScrapeMyGroups.mockRejectedValue({
      response: { data: { error: 'FACEBOOK_SESSION_REQUIRED' } },
    });

    await renderDashboard();
    fireEvent.click(screen.getByText(/Load Groups/));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/');
    });
    expect(localStorage.getItem('fbSessionReady')).toBeNull();
  });

  it('should show generic error message on other errors', async () => {
    mockScrapeMyGroups.mockRejectedValue(new Error('Network failure'));

    await renderDashboard();
    fireEvent.click(screen.getByText(/Load Groups/));

    await waitFor(() => {
      expect(screen.getByText(/Error:.*Network failure/)).toBeInTheDocument();
    });
  });

  it('should disable button while loading', async () => {
    let resolve;
    mockScrapeMyGroups.mockReturnValue(new Promise(r => { resolve = r; }));

    await renderDashboard();
    const btn = screen.getByText(/Load Groups/);
    fireEvent.click(btn);

    expect(screen.getByText(/Loading/)).toBeInTheDocument();

    resolve({ data: { success: true, groups: [] } });
    await waitFor(() => {
      expect(screen.getByText(/Load Groups/)).toBeInTheDocument();
    });
  });

  it('should logout and navigate to login on logout click', async () => {
    await renderDashboard();
    fireEvent.click(screen.getByText('Logout'));

    expect(localStorage.getItem('fbSessionReady')).toBeNull();
    expect(mockNavigate).toHaveBeenCalledWith('/');
  });

  it('should display groups count title after loading', async () => {
    mockScrapeMyGroups.mockResolvedValue({
      data: { success: true, groups: [{ id: '1', name: 'G1' }, { id: '2', name: 'G2' }] },
    });

    await renderDashboard();
    fireEvent.click(screen.getByText(/Load Groups/));

    await waitFor(() => {
      expect(screen.getByText('Found 2 groups')).toBeInTheDocument();
    });
  });
});
