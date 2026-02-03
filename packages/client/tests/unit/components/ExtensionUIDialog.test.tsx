import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ExtensionUIDialog } from '../../../src/components/ExtensionUIDialog';
import type { ExtensionUIRequest } from '@pi-web-ui/shared';

describe('ExtensionUIDialog', () => {
  const onResponse = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('notify request', () => {
    it('renders nothing for notify requests', () => {
      const request: ExtensionUIRequest = {
        method: 'notify',
        message: 'Test notification',
      };
      const { container } = render(<ExtensionUIDialog request={request} onResponse={onResponse} />);
      expect(container.firstChild).toBeNull();
    });
  });

  describe('select dialog', () => {
    const selectRequest: ExtensionUIRequest = {
      method: 'select',
      requestId: 'req-1',
      title: 'Select an option',
      options: ['Option 1', 'Option 2', 'Option 3'],
    };

    it('renders select dialog with title', () => {
      render(<ExtensionUIDialog request={selectRequest} onResponse={onResponse} />);
      expect(screen.getByText('Select an option')).toBeInTheDocument();
    });

    it('renders all options', () => {
      render(<ExtensionUIDialog request={selectRequest} onResponse={onResponse} />);
      expect(screen.getByText('Option 1')).toBeInTheDocument();
      expect(screen.getByText('Option 2')).toBeInTheDocument();
      expect(screen.getByText('Option 3')).toBeInTheDocument();
    });

    it('calls onResponse with selected option on click', () => {
      render(<ExtensionUIDialog request={selectRequest} onResponse={onResponse} />);
      fireEvent.click(screen.getByText('Option 2'));
      expect(onResponse).toHaveBeenCalledWith({
        requestId: 'req-1',
        cancelled: false,
        value: 'Option 2',
      });
    });

    it('calls onResponse with cancelled on Escape', () => {
      render(<ExtensionUIDialog request={selectRequest} onResponse={onResponse} />);
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(onResponse).toHaveBeenCalledWith({
        requestId: 'req-1',
        cancelled: true,
      });
    });

    it('selects option with Enter key', () => {
      render(<ExtensionUIDialog request={selectRequest} onResponse={onResponse} />);
      fireEvent.keyDown(document, { key: 'Enter' });
      expect(onResponse).toHaveBeenCalledWith({
        requestId: 'req-1',
        cancelled: false,
        value: 'Option 1',
      });
    });

    it('navigates options with arrow keys', () => {
      render(<ExtensionUIDialog request={selectRequest} onResponse={onResponse} />);
      fireEvent.keyDown(document, { key: 'ArrowDown' });
      fireEvent.keyDown(document, { key: 'Enter' });
      expect(onResponse).toHaveBeenCalledWith({
        requestId: 'req-1',
        cancelled: false,
        value: 'Option 2',
      });
    });

    it('selects option with number key', () => {
      render(<ExtensionUIDialog request={selectRequest} onResponse={onResponse} />);
      fireEvent.keyDown(document, { key: '2' });
      expect(onResponse).toHaveBeenCalledWith({
        requestId: 'req-1',
        cancelled: false,
        value: 'Option 2',
      });
    });

    it('renders rich options with descriptions', () => {
      const richRequest: ExtensionUIRequest = {
        method: 'select',
        requestId: 'req-2',
        title: 'Select',
        options: [
          { value: 'a', label: 'Alpha', description: 'First option' },
          { value: 'b', label: 'Beta', description: 'Second option' },
        ],
      };
      render(<ExtensionUIDialog request={richRequest} onResponse={onResponse} />);
      expect(screen.getByText('Alpha')).toBeInTheDocument();
      expect(screen.getByText('First option')).toBeInTheDocument();
    });
  });

  describe('confirm dialog', () => {
    const confirmRequest: ExtensionUIRequest = {
      method: 'confirm',
      requestId: 'req-3',
      title: 'Confirm Action',
      message: 'Are you sure you want to proceed?',
    };

    it('renders confirm dialog with title and message', () => {
      render(<ExtensionUIDialog request={confirmRequest} onResponse={onResponse} />);
      expect(screen.getByText('Confirm Action')).toBeInTheDocument();
      expect(screen.getByText('Are you sure you want to proceed?')).toBeInTheDocument();
    });

    it('has Yes and No buttons', () => {
      render(<ExtensionUIDialog request={confirmRequest} onResponse={onResponse} />);
      expect(screen.getByText('Yes')).toBeInTheDocument();
      expect(screen.getByText('No')).toBeInTheDocument();
    });

    it('calls onResponse with true on Yes click', () => {
      render(<ExtensionUIDialog request={confirmRequest} onResponse={onResponse} />);
      fireEvent.click(screen.getByText('Yes'));
      expect(onResponse).toHaveBeenCalledWith({
        requestId: 'req-3',
        cancelled: false,
        value: true,
      });
    });

    it('calls onResponse with cancelled on No click', () => {
      render(<ExtensionUIDialog request={confirmRequest} onResponse={onResponse} />);
      fireEvent.click(screen.getByText('No'));
      expect(onResponse).toHaveBeenCalledWith({
        requestId: 'req-3',
        cancelled: true,
      });
    });

    it('confirms with y key', () => {
      render(<ExtensionUIDialog request={confirmRequest} onResponse={onResponse} />);
      fireEvent.keyDown(document, { key: 'y' });
      expect(onResponse).toHaveBeenCalledWith({
        requestId: 'req-3',
        cancelled: false,
        value: true,
      });
    });

    it('cancels with n key', () => {
      render(<ExtensionUIDialog request={confirmRequest} onResponse={onResponse} />);
      fireEvent.keyDown(document, { key: 'n' });
      expect(onResponse).toHaveBeenCalledWith({
        requestId: 'req-3',
        cancelled: true,
      });
    });
  });

  describe('input dialog', () => {
    const inputRequest: ExtensionUIRequest = {
      method: 'input',
      requestId: 'req-4',
      title: 'Enter Value',
      placeholder: 'Type here...',
    };

    it('renders input dialog with title', () => {
      render(<ExtensionUIDialog request={inputRequest} onResponse={onResponse} />);
      expect(screen.getByText('Enter Value')).toBeInTheDocument();
    });

    it('renders input with placeholder', () => {
      render(<ExtensionUIDialog request={inputRequest} onResponse={onResponse} />);
      expect(screen.getByPlaceholderText('Type here...')).toBeInTheDocument();
    });

    it('submits value on Enter', () => {
      render(<ExtensionUIDialog request={inputRequest} onResponse={onResponse} />);
      const input = screen.getByPlaceholderText('Type here...');
      fireEvent.change(input, { target: { value: 'test value' } });
      fireEvent.keyDown(input, { key: 'Enter' });
      expect(onResponse).toHaveBeenCalledWith({
        requestId: 'req-4',
        cancelled: false,
        value: 'test value',
      });
    });

    it('cancels on Escape', () => {
      render(<ExtensionUIDialog request={inputRequest} onResponse={onResponse} />);
      const input = screen.getByPlaceholderText('Type here...');
      fireEvent.keyDown(input, { key: 'Escape' });
      expect(onResponse).toHaveBeenCalledWith({
        requestId: 'req-4',
        cancelled: true,
      });
    });
  });

  describe('editor dialog', () => {
    const editorRequest: ExtensionUIRequest = {
      method: 'editor',
      requestId: 'req-5',
      title: 'Edit Text',
      prefill: 'Initial content',
    };

    it('renders editor dialog with title', () => {
      render(<ExtensionUIDialog request={editorRequest} onResponse={onResponse} />);
      expect(screen.getByText('Edit Text')).toBeInTheDocument();
    });

    it('prefills textarea with content', () => {
      render(<ExtensionUIDialog request={editorRequest} onResponse={onResponse} />);
      const textarea = screen.getByRole('textbox');
      expect(textarea).toHaveValue('Initial content');
    });

    it('has submit and cancel buttons', () => {
      render(<ExtensionUIDialog request={editorRequest} onResponse={onResponse} />);
      expect(screen.getByText('Submit')).toBeInTheDocument();
      expect(screen.getByText('Cancel')).toBeInTheDocument();
    });

    it('submits on button click', () => {
      render(<ExtensionUIDialog request={editorRequest} onResponse={onResponse} />);
      const textarea = screen.getByRole('textbox');
      fireEvent.change(textarea, { target: { value: 'New content' } });
      fireEvent.click(screen.getByText('Submit'));
      expect(onResponse).toHaveBeenCalledWith({
        requestId: 'req-5',
        cancelled: false,
        value: 'New content',
      });
    });

    it('cancels on Cancel button click', () => {
      render(<ExtensionUIDialog request={editorRequest} onResponse={onResponse} />);
      fireEvent.click(screen.getByText('Cancel'));
      expect(onResponse).toHaveBeenCalledWith({
        requestId: 'req-5',
        cancelled: true,
      });
    });
  });
});
