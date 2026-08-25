import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import LocationAutocomplete from '../../components/LocationAutocomplete.jsx';

vi.mock('../../styles/location-autocomplete.css', () => ({}));

const mockGet = vi.fn();
vi.mock('../../services/http.js', () => ({
  default: { get: (...args) => mockGet(...args) },
}));

describe('LocationAutocomplete', () => {
  const onChange = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    onChange.mockClear();
    mockGet.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('rendering', () => {
    it('should render input with placeholder', () => {
      render(<LocationAutocomplete value="" onChange={onChange} placeholder="Add location..." />);
      expect(screen.getByPlaceholderText('Add location...')).toBeInTheDocument();
    });

    it('should render the location icon', () => {
      render(<LocationAutocomplete value="" onChange={onChange} placeholder="L" />);
      expect(screen.getByText('📍')).toBeInTheDocument();
    });

    it('should display selected chip when value is set', () => {
      render(<LocationAutocomplete value="Tel Aviv" onChange={onChange} placeholder="L" />);
      expect(screen.getByText('Tel Aviv')).toBeInTheDocument();
    });

    it('should disable clear button when disabled prop is true', () => {
      render(<LocationAutocomplete value="Tel Aviv" onChange={onChange} placeholder="L" disabled={true} />);
      expect(screen.queryByText('✕')).not.toBeInTheDocument();
    });
  });

  describe('clear button', () => {
    it('should show clear button when value is set', () => {
      render(<LocationAutocomplete value="Tel Aviv" onChange={onChange} placeholder="L" />);
      expect(screen.getByText('✕')).toBeInTheDocument();
    });

    it('should not show clear button when value is empty', () => {
      render(<LocationAutocomplete value="" onChange={onChange} placeholder="L" />);
      expect(screen.queryByText('✕')).not.toBeInTheDocument();
    });

    it('should call onChange with empty string when clear clicked', () => {
      render(<LocationAutocomplete value="Tel Aviv" onChange={onChange} placeholder="L" />);
      fireEvent.mouseDown(screen.getByText('✕'));
      expect(onChange).toHaveBeenCalledWith('');
    });
  });

  describe('typing', () => {
    it('should update input value when user types', () => {
      render(<LocationAutocomplete value="" onChange={onChange} placeholder="L" />);
      const input = screen.getByPlaceholderText('L');
      fireEvent.change(input, { target: { value: 'Tel' } });
      expect(input.value).toBe('Tel');
    });
  });

  describe('API debounce', () => {
    it('should debounce API calls', async () => {
      mockGet.mockResolvedValue({ data: [] });

      render(<LocationAutocomplete value="" onChange={onChange} placeholder="L" />);
      const input = screen.getByPlaceholderText('L');

      fireEvent.change(input, { target: { value: 'T' } });
      fireEvent.change(input, { target: { value: 'Te' } });
      fireEvent.change(input, { target: { value: 'Tel' } });

      expect(mockGet).not.toHaveBeenCalled();

      await act(async () => { vi.advanceTimersByTime(500); });

      expect(mockGet).toHaveBeenCalledTimes(1);
    });

    it('should not call API when query is less than 2 characters', async () => {
      mockGet.mockResolvedValue({ data: [] });

      render(<LocationAutocomplete value="" onChange={onChange} placeholder="L" />);
      fireEvent.change(screen.getByPlaceholderText('L'), { target: { value: 'T' } });

      await act(async () => { vi.advanceTimersByTime(500); });

      expect(mockGet).not.toHaveBeenCalled();
    });

    it('should call places API with query param', async () => {
      mockGet.mockResolvedValue({ data: [] });

      render(<LocationAutocomplete value="" onChange={onChange} placeholder="L" />);
      fireEvent.change(screen.getByPlaceholderText('L'), { target: { value: 'Tel Aviv' } });

      await act(async () => { vi.advanceTimersByTime(500); });

      expect(mockGet).toHaveBeenCalledWith(
        '/groups/places',
        expect.objectContaining({ params: { q: 'Tel Aviv' } }),
      );
    });
  });

  describe('dropdown results', () => {
    it('should show results from API', async () => {
      vi.useRealTimers();

      const mockResults = [
        { id: '1', name: 'Tel Aviv', city: 'Tel Aviv', country: 'Israel' },
      ];
      mockGet.mockResolvedValue({ data: mockResults });

      render(<LocationAutocomplete value="" onChange={onChange} placeholder="L" />);
      fireEvent.change(screen.getByPlaceholderText('L'), { target: { value: 'Tel Aviv' } });

      await waitFor(() => {
        expect(screen.getByText('Tel Aviv')).toBeInTheDocument();
      }, { timeout: 2000 });
    });

    it('should call onChange with selected place name', async () => {
      vi.useRealTimers();

      const mockResults = [
        { id: '1', name: 'Tel Aviv', city: 'Tel Aviv', country: 'Israel' },
      ];
      mockGet.mockResolvedValue({ data: mockResults });

      render(<LocationAutocomplete value="" onChange={onChange} placeholder="L" />);
      fireEvent.change(screen.getByPlaceholderText('L'), { target: { value: 'Tel Aviv' } });

      await waitFor(() => {
        expect(screen.getByText('Tel Aviv, Israel')).toBeInTheDocument();
      }, { timeout: 2000 });

      // Items use onMouseDown, not onClick
      fireEvent.mouseDown(screen.getByText('Tel Aviv, Israel').closest('li'));
      expect(onChange).toHaveBeenCalledWith('Tel Aviv, Tel Aviv, Israel');
    });

    it('should show selected chip after selection', async () => {
      vi.useRealTimers();

      const mockResults = [
        { id: '1', name: 'Tel Aviv', city: 'Tel Aviv', country: 'Israel' },
      ];
      mockGet.mockResolvedValue({ data: mockResults });

      render(<LocationAutocomplete value="" onChange={onChange} placeholder="L" />);
      fireEvent.change(screen.getByPlaceholderText('L'), { target: { value: 'Tel Aviv' } });

      await waitFor(() => {
        expect(screen.getByText('Tel Aviv, Israel')).toBeInTheDocument();
      }, { timeout: 2000 });

      fireEvent.mouseDown(screen.getByText('Tel Aviv, Israel').closest('li'));

      // After selection, a chip is shown (no more input)
      await waitFor(() => {
        expect(screen.queryByPlaceholderText('L')).not.toBeInTheDocument();
      });
    });
  });

  describe('outside click', () => {
    it('should close dropdown on outside click', async () => {
      vi.useRealTimers();

      const mockResults = [
        { id: '1', name: 'Tel Aviv', city: 'Tel Aviv', country: 'Israel' },
      ];
      mockGet.mockResolvedValue({ data: mockResults });

      render(
        <div>
          <div data-testid="outside">Outside</div>
          <LocationAutocomplete value="" onChange={onChange} placeholder="L" />
        </div>,
      );

      fireEvent.change(screen.getByPlaceholderText('L'), { target: { value: 'Tel Aviv' } });

      await waitFor(() => {
        expect(screen.getByText('Tel Aviv, Israel')).toBeInTheDocument();
      }, { timeout: 2000 });

      fireEvent.mouseDown(screen.getByTestId('outside'));

      await waitFor(() => {
        expect(screen.queryByText('Tel Aviv, Israel')).not.toBeInTheDocument();
      });
    });
  });
});
