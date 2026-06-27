import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../styles/auth.css', () => ({}));

import Privacy from '../../pages/Privacy.jsx';

describe('Privacy page', () => {
  const renderPrivacy = () =>
    render(
      <MemoryRouter>
        <Privacy />
      </MemoryRouter>
    );

  it('renders privacy header', () => {
    renderPrivacy();
    expect(screen.getByText(/מדיניות פרטיות ותנאי שימוש/)).toBeInTheDocument();
  });

  it('renders privacy policy section', () => {
    renderPrivacy();
    expect(screen.getByText(/🔒 מדיניות פרטיות/)).toBeInTheDocument();
  });

  it('renders terms section', () => {
    renderPrivacy();
    expect(screen.getByText(/📋 תנאי שימוש/)).toBeInTheDocument();
  });

  it('renders back button', () => {
    renderPrivacy();
    expect(screen.getByText('←')).toBeInTheDocument();
  });

  it('renders security info', () => {
    renderPrivacy();
    expect(screen.getByText(/AES-256-GCM/)).toBeInTheDocument();
  });
});
