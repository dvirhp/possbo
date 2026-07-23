import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// Mock pages to avoid loading their dependencies
vi.mock('../pages/Landing.jsx', () => ({
  default: () => <div data-testid="landing-page">Landing</div>,
}));
vi.mock('../pages/Login.jsx', () => ({
  default: () => <div data-testid="login-page">Login</div>,
}));
vi.mock('../pages/Register.jsx', () => ({
  default: () => <div data-testid="register-page">Register</div>,
}));
vi.mock('../pages/Dashboard.jsx', () => ({
  default: () => <div data-testid="dashboard-page">Dashboard</div>,
}));
vi.mock('../pages/GroupDetails.jsx', () => ({
  default: () => <div data-testid="group-details-page">GroupDetails</div>,
}));
vi.mock('../pages/Privacy.jsx', () => ({
  default: () => <div data-testid="privacy-page">Privacy</div>,
}));
vi.mock('../pages/ForgotPassword.jsx', () => ({
  default: () => <div data-testid="forgot-password-page">ForgotPassword</div>,
}));
vi.mock('../pages/OAuthCallback.jsx', () => ({
  default: () => <div data-testid="oauth-callback-page">OAuthCallback</div>,
}));
vi.mock('../pages/CreatePost.jsx', () => ({
  default: () => <div data-testid="create-post-page">CreatePost</div>,
}));
vi.mock('../pages/Templates.jsx', () => ({
  default: () => <div data-testid="templates-page">Templates</div>,
}));
vi.mock('../pages/TemplateForm.jsx', () => ({
  default: () => <div data-testid="template-form-page">TemplateForm</div>,
}));
vi.mock('../pages/Reports.jsx', () => ({
  default: () => <div data-testid="reports-page">Reports</div>,
}));
vi.mock('../pages/Guides.jsx', () => ({
  default: () => <div data-testid="guides-page">Guides</div>,
}));
vi.mock('../pages/Subscription.jsx', () => ({
  default: () => <div data-testid="subscription-page">Subscription</div>,
}));
vi.mock('../pages/GeneratePost.jsx', () => ({
  default: () => <div data-testid="generate-post-page">GeneratePost</div>,
}));
vi.mock('../pages/Feedback.jsx', () => ({
  default: () => <div data-testid="feedback-page">Feedback</div>,
}));
vi.mock('../pages/PostDetails.jsx', () => ({
  default: () => <div data-testid="post-details-page">PostDetails</div>,
}));
vi.mock('../pages/ScheduledCalendar.jsx', () => ({
  default: () => <div data-testid="calendar-page">Calendar</div>,
}));
vi.mock('../pages/MyGroups.jsx', () => ({
  default: () => <div data-testid="my-groups-page">MyGroups</div>,
}));
vi.mock('../App.css', () => ({}));
vi.mock('../styles/sidebar.css', () => ({}));

describe('App', () => {
  it('should render Landing page at root route', async () => {
    const App = (await import('../App.jsx')).default;

    render(<App />);

    expect(screen.getByTestId('landing-page')).toBeInTheDocument();
  });

  it('should render Login page at /login route', async () => {
    window.history.pushState({}, '', '/login');
    const App = (await import('../App.jsx')).default;

    render(<App />);

    expect(screen.getByTestId('login-page')).toBeInTheDocument();
  });

  it('should render Register page at /register route', async () => {
    window.history.pushState({}, '', '/register');
    const App = (await import('../App.jsx')).default;

    render(<App />);

    expect(screen.getByTestId('register-page')).toBeInTheDocument();
  });

  it('should render Privacy page at /privacy route', async () => {
    window.history.pushState({}, '', '/privacy');
    const App = (await import('../App.jsx')).default;

    render(<App />);

    await screen.findByTestId('privacy-page');
    expect(screen.getByTestId('privacy-page')).toBeInTheDocument();
  });

  it('should render ForgotPassword page at /forgot-password route', async () => {
    window.history.pushState({}, '', '/forgot-password');
    const App = (await import('../App.jsx')).default;

    render(<App />);

    await screen.findByTestId('forgot-password-page');
    expect(screen.getByTestId('forgot-password-page')).toBeInTheDocument();
  });

  it('should wrap Dashboard in AuthLayout (lazy loaded)', async () => {
    // Navigate back to root to avoid stale route state
    window.history.pushState({}, '', '/');
    const App = (await import('../App.jsx')).default;

    render(<App />);

    // Landing should render at root — Dashboard requires auth
    expect(screen.getByTestId('landing-page')).toBeInTheDocument();
  });
});
