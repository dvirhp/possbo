import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// Mock pages to avoid loading their dependencies
vi.mock('../pages/Login.jsx', () => ({
  default: () => <div data-testid="login-page">Login</div>,
}));
vi.mock('../pages/Dashboard.jsx', () => ({
  default: () => <div data-testid="dashboard-page">Dashboard</div>,
}));
vi.mock('../pages/GroupDetails.jsx', () => ({
  default: () => <div data-testid="group-details-page">GroupDetails</div>,
}));
vi.mock('../App.css', () => ({}));

describe('App', () => {
  it('should render Login page at root route', async () => {
    // Need to import after mocks
    const { MemoryRouter } = await import('react-router-dom');
    const App = (await import('../App.jsx')).default;

    // App uses BrowserRouter internally, but we need to test routes
    // So we render it and it should show Login at /
    render(<App />);

    expect(screen.getByTestId('login-page')).toBeInTheDocument();
  });
});
