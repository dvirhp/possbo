import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const mockCapture = vi.fn();
vi.mock('../../services/screenshotService.js', () => ({
  screenshotService: { capture: (...args) => mockCapture(...args) },
}));

const mockPublish = vi.fn();
const mockGetHistory = vi.fn();
vi.mock('../../services/publishService.js', () => ({
  publishService: {
    publish: (...args) => mockPublish(...args),
    getHistory: (...args) => mockGetHistory(...args),
  },
}));

const mockGetGroupPosts = vi.fn();
vi.mock('../../services/groupsService.js', () => ({
  groupsService: {
    getGroupPosts: (...args) => mockGetGroupPosts(...args),
  },
}));

vi.mock('../../assets/i18n', () => ({
  default: {
    groupDetails: {
      backToList: 'Back',
      openInFacebook: 'Open in FB',
      captureScreenshot: 'Capture',
      capturing: 'Capturing...',
      publishPost: 'Publish Post',
      groupNotFound: 'Group not found',
      back: 'Back',
      screenshotTitle: 'Screenshot',
      captureFailed: 'Capture failed',
    },
    publish: {
      title: 'Create Post',
      textPlaceholder: 'Write something...',
      addImage: 'Image/Video',
      addToPost: 'Add to post',
      tagPeople: 'Tag people',
      addEmoji: 'Emoji',
      addLocation: 'Location',
      locationPlaceholder: 'Add location...',
      postAnonymously: 'Post anonymously',
      submit: 'Publish',
      publishing: 'Publishing...',
      success: 'Published successfully!',
      failed: 'Publish failed',
      textRequired: 'Text is required',
      postLink: 'Post link',
    },
    list: { details: 'Details', noItems: 'No items', openLink: 'Open' },
    dashboard: { searchPlaceholder: 'Search...' },
    errors: { generic: 'Error:' },
  },
}));

vi.mock('../../styles/group-details.css', () => ({}));
vi.mock('../../styles/generic-list.css', () => ({}));
vi.mock('../../styles/location-autocomplete.css', () => ({}));

const mockGroup = {
  id: '1',
  name: 'Test Group',
  url: 'https://facebook.com/groups/123',
  image: 'http://img.com/group.png',
};

const renderGroupDetails = async (state = mockGroup) => {
  vi.resetModules();
  const GroupDetails = (await import('../../pages/GroupDetails.jsx')).default;

  render(
    <MemoryRouter initialEntries={[{ pathname: '/group/1', state }]}>
      <Routes>
        <Route path="/group/:id" element={<GroupDetails />} />
      </Routes>
    </MemoryRouter>,
  );
};

const renderGroupDetailsWithContainer = async (state = mockGroup) => {
  vi.resetModules();
  const GroupDetails = (await import('../../pages/GroupDetails.jsx')).default;

  return render(
    <MemoryRouter initialEntries={[{ pathname: '/group/1', state }]}>
      <Routes>
        <Route path="/group/:id" element={<GroupDetails />} />
      </Routes>
    </MemoryRouter>,
  );
};

describe('GroupDetails page', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    mockCapture.mockClear();
    mockPublish.mockClear();
    mockGetHistory.mockClear();
    mockGetGroupPosts.mockClear();
    mockGetHistory.mockResolvedValue({ data: { success: true, posts: [] } });
    mockGetGroupPosts.mockResolvedValue({ data: { success: true, posts: [] } });
    localStorage.setItem('fbSessionReady', 'true');
  });

  describe('rendering', () => {
    it('should show group not found when no state', async () => {
      await renderGroupDetails(null);
      expect(screen.getByText('Group not found')).toBeInTheDocument();
    });

    it('should render group name', async () => {
      await renderGroupDetails();
      const elements = screen.getAllByText('Test Group');
      expect(elements.length).toBeGreaterThan(0);
    });

    it('should render group image', async () => {
      const { container } = await renderGroupDetailsWithContainer();
      const img = container.querySelector('img.group-details-image');
      expect(img).toHaveAttribute('src', 'http://img.com/group.png');
    });

    it('should render Facebook link', async () => {
      await renderGroupDetails();
      const link = screen.getByText('🔗 Open in FB');
      expect(link).toHaveAttribute('href', 'https://facebook.com/groups/123');
      expect(link).toHaveAttribute('target', '_blank');
    });

    it('should render capture and publish buttons', async () => {
      await renderGroupDetails();
      expect(screen.getByText(/Capture/)).toBeInTheDocument();
      expect(screen.getByText(/Publish Post/)).toBeInTheDocument();
    });

    it('should render back button', async () => {
      await renderGroupDetails();
      expect(document.querySelector('.gd-back')).toBeInTheDocument();
    });
  });

  describe('screenshot capture', () => {
    it('should capture screenshot on button click', async () => {
      mockCapture.mockResolvedValue({ data: { success: true, screenshot: 'abc123' } });

      await renderGroupDetails();
      fireEvent.click(screen.getByText(/Capture/));

      await waitFor(() => {
        expect(mockCapture).toHaveBeenCalledWith('https://facebook.com/groups/123');
      });
    });

    it('should show screenshot image after capture', async () => {
      mockCapture.mockResolvedValue({ data: { success: true, screenshot: 'base64data' } });

      await renderGroupDetails();
      fireEvent.click(screen.getByText(/Capture/));

      await waitFor(() => {
        const img = screen.getByAltText('Screenshot');
        expect(img).toHaveAttribute('src', 'data:image/png;base64,base64data');
      });
    });

    it('should show error when capture fails', async () => {
      mockCapture.mockResolvedValue({ data: { success: false } });

      await renderGroupDetails();
      fireEvent.click(screen.getByText(/Capture/));

      await waitFor(() => {
        expect(screen.getByText('Capture failed')).toBeInTheDocument();
      });
    });

    it('should redirect on session required error', async () => {
      mockCapture.mockRejectedValue({ response: { data: { error: 'FACEBOOK_SESSION_REQUIRED' } } });

      await renderGroupDetails();
      fireEvent.click(screen.getByText(/Capture/));

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/');
      });
    });

    it('should show error message on generic error', async () => {
      mockCapture.mockRejectedValue(new Error('Timeout'));

      await renderGroupDetails();
      fireEvent.click(screen.getByText(/Capture/));

      await waitFor(() => {
        expect(screen.getByText('שגיאה בלתי צפויה')).toBeInTheDocument();
      });
    });
  });

  describe('publish post', () => {
    it('should open post form on button click', async () => {
      await renderGroupDetails();
      fireEvent.click(screen.getByText(/Publish Post/));

      expect(screen.getByText('Create Post')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Write something...')).toBeInTheDocument();
    });

    it('should disable submit button when text is empty', async () => {
      await renderGroupDetails();
      fireEvent.click(screen.getByText(/Publish Post/));
      // The submit button should be disabled when no text
      const submitBtn = screen.getByText(/^Publish$/i);
      expect(submitBtn).toBeDisabled();
    });

    it('should publish successfully', async () => {
      mockPublish.mockResolvedValue({
        data: { success: true, screenshot: null, savedPost: { postUrl: null } },
      });

      await renderGroupDetails();
      fireEvent.click(screen.getByText(/Publish Post/));

      const textarea = screen.getByPlaceholderText('Write something...');
      fireEvent.change(textarea, { target: { value: 'My post text' } });
      fireEvent.click(screen.getByText(/^Publish$/i));

      await waitFor(() => {
        expect(mockPublish).toHaveBeenCalledWith(
          'https://facebook.com/groups/123',
          'My post text',
          null,
          'Test Group',
          false,
          '',
        );
      });
    });

    it('should show success message after publish', async () => {
      mockPublish.mockResolvedValue({
        data: { success: true, screenshot: null, savedPost: { postUrl: null } },
      });

      await renderGroupDetails();
      fireEvent.click(screen.getByText(/Publish Post/));
      fireEvent.change(screen.getByPlaceholderText('Write something...'), { target: { value: 'X' } });
      fireEvent.click(screen.getByText(/^Publish$/i));

      await waitFor(() => {
        expect(screen.getByText(/Published successfully/)).toBeInTheDocument();
      });
    });

    it('should show error on publish failure', async () => {
      mockPublish.mockRejectedValue(new Error('Browser error'));

      await renderGroupDetails();
      fireEvent.click(screen.getByText(/Publish Post/));
      fireEvent.change(screen.getByPlaceholderText('Write something...'), { target: { value: 'X' } });
      fireEvent.click(screen.getByText(/^Publish$/i));

      await waitFor(() => {
        expect(screen.getByText('שגיאה בלתי צפויה')).toBeInTheDocument();
      });
    });

    it('should close form on overlay click', async () => {
      await renderGroupDetails();
      fireEvent.click(screen.getByText(/Publish Post/));
      expect(screen.getByText('Create Post')).toBeInTheDocument();

      // Click overlay
      const overlay = document.querySelector('.fb-create-post-overlay');
      fireEvent.click(overlay);

      expect(screen.queryByText('Create Post')).not.toBeInTheDocument();
    });

    it('should close form on X button click', async () => {
      await renderGroupDetails();
      fireEvent.click(screen.getByText(/Publish Post/));
      fireEvent.click(screen.getByText('✕'));
      expect(screen.queryByText('Create Post')).not.toBeInTheDocument();
    });
  });

  describe('navigation', () => {
    it('should navigate to dashboard on back click', async () => {
      await renderGroupDetails();
      const backBtn = document.querySelector('.gd-back');
      fireEvent.click(backBtn);
      expect(mockNavigate).toHaveBeenCalledWith(-1);
    });

    it('should navigate to dashboard from group not found', async () => {
      await renderGroupDetails(null);
      fireEvent.click(screen.getByText(/Back/));
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard');
    });
  });

  describe('post history', () => {
    it('should load posts on mount', async () => {
      mockGetGroupPosts.mockResolvedValue({
        data: { success: true, posts: [{ id: '1', text: 'Old post' }] },
      });

      await renderGroupDetails();

      await waitFor(() => {
        expect(mockGetGroupPosts).toHaveBeenCalledWith('1');
      });
    });
  });
});
