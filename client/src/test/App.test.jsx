import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// Mock pages to avoid loading their dependencies
vi.mock('../pages/Landing.jsx', () => ({
  default: () => <div data-testid="landing-page">Landing</div>,
}));
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
  it('should render Landing page at root route', async () => {
    const App = (await import('../App.jsx')).default;

    render(<App />);

    expect(screen.getByTestId('landing-page')).toBeInTheDocument();
  });
});
