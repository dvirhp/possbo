import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import GenericList from '../../components/GenericList.jsx';

// Mock locale
vi.mock('../../assets/i18n', () => ({
  default: {
    list: { details: 'Details', noItems: 'No items', openLink: 'Open' },
    dashboard: { searchPlaceholder: 'Search...' },
  },
}));

vi.mock('../../styles/generic-list.css', () => ({}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

const renderWithRouter = (ui) => render(<MemoryRouter>{ui}</MemoryRouter>);

const mockItems = [
  { id: '1', name: 'Group Alpha', url: 'https://example.com/1' },
  { id: '2', name: 'Group Beta', url: 'https://example.com/2' },
  { id: '3', name: 'Group Gamma', subtitle: 'Sub text' },
];

beforeEach(() => {
  mockNavigate.mockClear();
});

describe('GenericList', () => {
  describe('rendering', () => {
    it('should render empty message when items is empty array', () => {
      renderWithRouter(<GenericList items={[]} />);
      expect(screen.getByText('No items')).toBeInTheDocument();
    });

    it('should render empty message when items is null', () => {
      renderWithRouter(<GenericList items={null} />);
      expect(screen.getByText('No items')).toBeInTheDocument();
    });

    it('should render empty message when items is undefined', () => {
      renderWithRouter(<GenericList items={undefined} />);
      expect(screen.getByText('No items')).toBeInTheDocument();
    });

    it('should render custom empty message', () => {
      renderWithRouter(<GenericList items={[]} emptyMessage="Nothing here!" />);
      expect(screen.getByText('Nothing here!')).toBeInTheDocument();
    });

    it('should render all item names', () => {
      renderWithRouter(<GenericList items={mockItems} />);
      expect(screen.getByText('Group Alpha')).toBeInTheDocument();
      expect(screen.getByText('Group Beta')).toBeInTheDocument();
      expect(screen.getByText('Group Gamma')).toBeInTheDocument();
    });

    it('should render subtitle when provided', () => {
      renderWithRouter(<GenericList items={mockItems} />);
      expect(screen.getByText('Sub text')).toBeInTheDocument();
    });

    it('should render item image when provided', () => {
      const items = [{ id: '1', name: 'Test', image: 'http://img.com/1.png' }];
      const { container } = renderWithRouter(<GenericList items={items} />);
      const img = container.querySelector('img');
      expect(img).toHaveAttribute('src', 'http://img.com/1.png');
    });

    it('should render title when provided', () => {
      renderWithRouter(<GenericList items={mockItems} title="My List" />);
      expect(screen.getByText('My List')).toBeInTheDocument();
    });

    it('should not render title when not provided', () => {
      renderWithRouter(<GenericList items={mockItems} />);
      expect(screen.queryByRole('heading', { level: 4 })).not.toBeInTheDocument();
    });
  });

  describe('search', () => {
    it('should render search input by default', () => {
      renderWithRouter(<GenericList items={mockItems} />);
      expect(screen.getByPlaceholderText('Search...')).toBeInTheDocument();
    });

    it('should filter items based on search input', () => {
      renderWithRouter(<GenericList items={mockItems} />);
      fireEvent.change(screen.getByPlaceholderText('Search...'), { target: { value: 'alpha' } });

      expect(screen.getByText('Group Alpha')).toBeInTheDocument();
      expect(screen.queryByText('Group Beta')).not.toBeInTheDocument();
      expect(screen.queryByText('Group Gamma')).not.toBeInTheDocument();
    });

    it('should show "No items" when search has no results', () => {
      renderWithRouter(<GenericList items={mockItems} />);
      fireEvent.change(screen.getByPlaceholderText('Search...'), { target: { value: 'zzz' } });

      expect(screen.getByText('No items')).toBeInTheDocument();
    });

    it('should not render search when searchable is false', () => {
      renderWithRouter(<GenericList items={mockItems} searchable={false} />);
      expect(screen.queryByPlaceholderText('Search...')).not.toBeInTheDocument();
    });

    it('should show clear button when search has value', () => {
      renderWithRouter(<GenericList items={mockItems} />);
      fireEvent.change(screen.getByPlaceholderText('Search...'), { target: { value: 'a' } });
      expect(screen.getByText('✕')).toBeInTheDocument();
    });

    it('should clear search and show all items when clear clicked', () => {
      renderWithRouter(<GenericList items={mockItems} />);
      fireEvent.change(screen.getByPlaceholderText('Search...'), { target: { value: 'alpha' } });
      expect(screen.queryByText('Group Beta')).not.toBeInTheDocument();

      fireEvent.click(screen.getByText('✕'));
      expect(screen.getByText('Group Beta')).toBeInTheDocument();
    });

    it('should be case-insensitive', () => {
      renderWithRouter(<GenericList items={mockItems} />);
      fireEvent.change(screen.getByPlaceholderText('Search...'), { target: { value: 'BETA' } });

      expect(screen.getByText('Group Beta')).toBeInTheDocument();
      expect(screen.queryByText('Group Alpha')).not.toBeInTheDocument();
    });
  });

  describe('linkMode="internal"', () => {
    it('should navigate to basePath/id on button click', () => {
      const items = [{ id: '42', name: 'Test Group' }];
      renderWithRouter(<GenericList items={items} basePath="/group" linkMode="internal" />);

      fireEvent.click(screen.getByRole('button'));
      expect(mockNavigate).toHaveBeenCalledWith('/group/42', { state: items[0] });
    });

    it('should render default label "Details"', () => {
      const items = [{ id: '1', name: 'Item' }];
      renderWithRouter(<GenericList items={items} linkMode="internal" basePath="/x" />);
      expect(screen.getByText(/Details/)).toBeInTheDocument();
    });

    it('should use custom buttonLabel', () => {
      const items = [{ id: '1', name: 'Item' }];
      renderWithRouter(<GenericList items={items} buttonLabel="Go" basePath="/x" />);
      expect(screen.getByText(/Go/)).toBeInTheDocument();
    });
  });

  describe('linkMode="external"', () => {
    it('should not render button when item.url is falsy', () => {
      const items = [{ id: '1', name: 'No URL' }];
      renderWithRouter(<GenericList items={items} linkMode="external" />);
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });

    it('should open URL in new tab on button click', () => {
      const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
      const items = [{ id: '1', name: 'Link', url: 'https://example.com' }];
      renderWithRouter(<GenericList items={items} linkMode="external" />);

      fireEvent.click(screen.getByRole('button'));
      expect(openSpy).toHaveBeenCalledWith('https://example.com', '_blank', 'noopener,noreferrer');
      openSpy.mockRestore();
    });

    it('should render "Open" label by default', () => {
      const items = [{ id: '1', name: 'Item', url: 'http://x' }];
      renderWithRouter(<GenericList items={items} linkMode="external" />);
      expect(screen.getByText(/Open/)).toBeInTheDocument();
    });
  });
});
