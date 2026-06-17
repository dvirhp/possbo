import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import LocationAutocomplete from '../../components/LocationAutocomplete.jsx';

vi.mock('../../styles/location-autocomplete.css', () => ({}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('LocationAutocomplete', () => {
  const onChange = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    onChange.mockClear();
    mockFetch.mockClear();
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

    it('should display the value prop in input', () => {
      render(<LocationAutocomplete value="Tel Aviv" onChange={onChange} placeholder="L" />);
      expect(screen.getByDisplayValue('Tel Aviv')).toBeInTheDocument();
    });

    it('should disable input when disabled prop is true', () => {
      render(<LocationAutocomplete value="" onChange={onChange} placeholder="L" disabled={true} />);
      expect(screen.getByPlaceholderText('L')).toBeDisabled();
    });
  });

  describe('clear button', () => {
    it('should show clear button when value is not empty', () => {
      render(<LocationAutocomplete value="Tel Aviv" onChange={onChange} placeholder="L" />);
      expect(screen.getByText('✕')).toBeInTheDocument();
    });

    it('should not show clear button when value is empty', () => {
      render(<LocationAutocomplete value="" onChange={onChange} placeholder="L" />);
      expect(screen.queryByText('✕')).not.toBeInTheDocument();
    });

    it('should call onChange with empty string when clear clicked', () => {
      render(<LocationAutocomplete value="Tel Aviv" onChange={onChange} placeholder="L" />);
      fireEvent.click(screen.getByText('✕'));
      expect(onChange).toHaveBeenCalledWith('');
    });
  });

  describe('typing', () => {
    it('should call onChange when user types', () => {
      render(<LocationAutocomplete value="" onChange={onChange} placeholder="L" />);
      fireEvent.change(screen.getByPlaceholderText('L'), { target: { value: 'Tel' } });
      expect(onChange).toHaveBeenCalledWith('Tel');
    });
  });

  describe('API debounce', () => {
    it('should debounce API calls', async () => {
      mockFetch.mockResolvedValue({ json: () => Promise.resolve([]) });

      render(<LocationAutocomplete value="" onChange={onChange} placeholder="L" />);
      const input = screen.getByPlaceholderText('L');

      fireEvent.change(input, { target: { value: 'T' } });
      fireEvent.change(input, { target: { value: 'Te' } });
      fireEvent.change(input, { target: { value: 'Tel' } });

      expect(mockFetch).not.toHaveBeenCalled();

      await act(async () => { vi.advanceTimersByTime(500); });

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should not call API when query is less than 2 characters', async () => {
      mockFetch.mockResolvedValue({ json: () => Promise.resolve([]) });

      render(<LocationAutocomplete value="" onChange={onChange} placeholder="L" />);
      fireEvent.change(screen.getByPlaceholderText('L'), { target: { value: 'T' } });

      await act(async () => { vi.advanceTimersByTime(500); });

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should call Nominatim API with encoded query', async () => {
      mockFetch.mockResolvedValue({ json: () => Promise.resolve([]) });

      render(<LocationAutocomplete value="" onChange={onChange} placeholder="L" />);
      fireEvent.change(screen.getByPlaceholderText('L'), { target: { value: 'Tel Aviv' } });

      await act(async () => { vi.advanceTimersByTime(500); });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('nominatim.openstreetmap.org'),
      );
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('Tel%20Aviv'),
      );
    });
  });

  describe('dropdown results', () => {
    it('should show results from API', async () => {
      vi.useRealTimers();

      const mockResults = [
        { place_id: 1, display_name: 'Tel Aviv, Israel, Middle East' },
      ];
      mockFetch.mockResolvedValue({ json: () => Promise.resolve(mockResults) });

      render(<LocationAutocomplete value="" onChange={onChange} placeholder="L" />);
      fireEvent.change(screen.getByPlaceholderText('L'), { target: { value: 'Tel Aviv' } });

      await waitFor(() => {
        expect(screen.getByText('Tel Aviv, Israel')).toBeInTheDocument();
      }, { timeout: 2000 });
    });

    it('should call onChange with selected place name', async () => {
      vi.useRealTimers();

      const mockResults = [
        { place_id: 1, display_name: 'Tel Aviv, Israel, Middle East' },
      ];
      mockFetch.mockResolvedValue({ json: () => Promise.resolve(mockResults) });

      render(<LocationAutocomplete value="" onChange={onChange} placeholder="L" />);
      fireEvent.change(screen.getByPlaceholderText('L'), { target: { value: 'Tel Aviv' } });

      await waitFor(() => {
        expect(screen.getByText('Tel Aviv, Israel')).toBeInTheDocument();
      }, { timeout: 2000 });

      fireEvent.click(screen.getByText('Tel Aviv, Israel'));
      expect(onChange).toHaveBeenCalledWith('Tel Aviv, Israel');
    });

    it('should hide dropdown after selection', async () => {
      vi.useRealTimers();

      const mockResults = [
        { place_id: 1, display_name: 'Tel Aviv, Israel, Middle East' },
      ];
      mockFetch.mockResolvedValue({ json: () => Promise.resolve(mockResults) });

      render(<LocationAutocomplete value="" onChange={onChange} placeholder="L" />);
      fireEvent.change(screen.getByPlaceholderText('L'), { target: { value: 'Tel Aviv' } });

      await waitFor(() => {
        expect(screen.getByText('Tel Aviv, Israel')).toBeInTheDocument();
      }, { timeout: 2000 });

      fireEvent.click(screen.getByText('Tel Aviv, Israel'));

      await waitFor(() => {
        expect(screen.queryByText('Tel Aviv, Israel')).not.toBeInTheDocument();
      });
    });
  });

  describe('outside click', () => {
    it('should close dropdown on outside click', async () => {
      vi.useRealTimers();

      const mockResults = [
        { place_id: 1, display_name: 'Tel Aviv, Israel, Middle East' },
      ];
      mockFetch.mockResolvedValue({ json: () => Promise.resolve(mockResults) });

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
