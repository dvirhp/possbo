import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('../../styles/confirm-dialog.css', () => ({}));

import ConfirmDialog from '../../components/ConfirmDialog.jsx';

describe('ConfirmDialog', () => {
  const defaultProps = {
    open: true,
    title: 'מחיקה',
    message: 'האם למחוק?',
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
  };

  beforeEach(() => {
    defaultProps.onConfirm.mockClear();
    defaultProps.onCancel.mockClear();
  });

  it('renders nothing when closed', () => {
    const { container } = render(<ConfirmDialog {...defaultProps} open={false} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders title and message when open', () => {
    render(<ConfirmDialog {...defaultProps} />);
    expect(screen.getByText('מחיקה')).toBeInTheDocument();
    expect(screen.getByText('האם למחוק?')).toBeInTheDocument();
  });

  it('shows default title when none provided', () => {
    render(<ConfirmDialog {...defaultProps} title={undefined} />);
    expect(screen.getByText('האם אתה בטוח?')).toBeInTheDocument();
  });

  it('calls onConfirm when confirm button clicked', () => {
    render(<ConfirmDialog {...defaultProps} />);
    fireEvent.click(screen.getByText('בטוח!'));
    expect(defaultProps.onConfirm).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel when cancel button clicked', () => {
    render(<ConfirmDialog {...defaultProps} />);
    fireEvent.click(screen.getByText('ביטול'));
    expect(defaultProps.onCancel).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel when overlay is clicked', () => {
    render(<ConfirmDialog {...defaultProps} />);
    fireEvent.click(document.querySelector('.confirm-overlay'));
    expect(defaultProps.onCancel).toHaveBeenCalledTimes(1);
  });

  it('does not call onCancel when dialog body is clicked', () => {
    render(<ConfirmDialog {...defaultProps} />);
    fireEvent.click(document.querySelector('.confirm-dialog'));
    expect(defaultProps.onCancel).not.toHaveBeenCalled();
  });

  it('calls onCancel on Escape key', () => {
    render(<ConfirmDialog {...defaultProps} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(defaultProps.onCancel).toHaveBeenCalledTimes(1);
  });

  it('uses custom button text', () => {
    render(<ConfirmDialog {...defaultProps} confirmText="כן, מחק" cancelText="לא" />);
    expect(screen.getByText('כן, מחק')).toBeInTheDocument();
    expect(screen.getByText('לא')).toBeInTheDocument();
  });

  it('shows warning emoji for danger mode', () => {
    render(<ConfirmDialog {...defaultProps} danger={true} />);
    expect(screen.getByText('⚠️')).toBeInTheDocument();
  });

  it('shows info emoji for non-danger mode', () => {
    render(<ConfirmDialog {...defaultProps} danger={false} />);
    expect(screen.getByText('ℹ️')).toBeInTheDocument();
  });
});
