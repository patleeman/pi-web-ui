import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ExtensionUIDialog } from '../../../src/components/ExtensionUIDialog';
import type { ExtensionUIRequest } from '@pi-deck/shared';

describe('ExtensionUIDialog', () => {
  const defaultOnResponse = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Notify Request', () => {
    it('renders nothing for notify requests', () => {
      const notifyRequest: ExtensionUIRequest = {
        requestId: 'req-1',
        method: 'notify',
        message: 'This is a notification',
        type: 'info',
      };
      
      const { container } = render(
        <ExtensionUIDialog request={notifyRequest} onResponse={defaultOnResponse} />
      );
      
      expect(container.firstChild).toBeNull();
    });
  });

  describe('Select Dialog', () => {
    const selectRequest: ExtensionUIRequest = {
      requestId: 'req-1',
      method: 'select',
      title: 'Choose an option',
      options: ['Option A', 'Option B', 'Option C'],
    };

    const richOptionsRequest: ExtensionUIRequest = {
      requestId: 'req-2',
      method: 'select',
      title: 'Choose a model',
      options: [
        { value: 'claude', label: 'Claude', description: 'Anthropic AI' },
        { value: 'gpt', label: 'GPT-4', description: 'OpenAI' },
      ],
    };

    it('renders select dialog with title', () => {
      render(<ExtensionUIDialog request={selectRequest} onResponse={defaultOnResponse} />);
      expect(screen.getByText('Choose an option')).toBeInTheDocument();
    });

    it('renders all options', () => {
      render(<ExtensionUIDialog request={selectRequest} onResponse={defaultOnResponse} />);
      
      expect(screen.getByText('Option A')).toBeInTheDocument();
      expect(screen.getByText('Option B')).toBeInTheDocument();
      expect(screen.getByText('Option C')).toBeInTheDocument();
    });

    it('shows option numbers', () => {
      render(<ExtensionUIDialog request={selectRequest} onResponse={defaultOnResponse} />);
      
      expect(screen.getByText('1.')).toBeInTheDocument();
      expect(screen.getByText('2.')).toBeInTheDocument();
      expect(screen.getByText('3.')).toBeInTheDocument();
    });

    it('calls onResponse with selected option on click', () => {
      render(<ExtensionUIDialog request={selectRequest} onResponse={defaultOnResponse} />);
      
      fireEvent.click(screen.getByText('Option B'));
      
      expect(defaultOnResponse).toHaveBeenCalledWith({
        requestId: 'req-1',
        cancelled: false,
        value: 'Option B',
      });
    });

    it('calls onResponse with cancelled on Escape', () => {
      render(<ExtensionUIDialog request={selectRequest} onResponse={defaultOnResponse} />);
      
      fireEvent.keyDown(document, { key: 'Escape' });
      
      expect(defaultOnResponse).toHaveBeenCalledWith({
        requestId: 'req-1',
        cancelled: true,
      });
    });

    it('selects option with Enter key', () => {
      render(<ExtensionUIDialog request={selectRequest} onResponse={defaultOnResponse} />);
      
      fireEvent.keyDown(document, { key: 'Enter' });
      
      expect(defaultOnResponse).toHaveBeenCalledWith({
        requestId: 'req-1',
        cancelled: false,
        value: 'Option A', // First option selected by default
      });
    });

    it('navigates options with arrow keys', () => {
      render(<ExtensionUIDialog request={selectRequest} onResponse={defaultOnResponse} />);
      
      fireEvent.keyDown(document, { key: 'ArrowDown' });
      fireEvent.keyDown(document, { key: 'Enter' });
      
      expect(defaultOnResponse).toHaveBeenCalledWith({
        requestId: 'req-1',
        cancelled: false,
        value: 'Option B', // Second option after one ArrowDown
      });
    });

    it('selects option with number key', () => {
      render(<ExtensionUIDialog request={selectRequest} onResponse={defaultOnResponse} />);
      
      fireEvent.keyDown(document, { key: '2' });
      
      expect(defaultOnResponse).toHaveBeenCalledWith({
        requestId: 'req-1',
        cancelled: false,
        value: 'Option B',
      });
    });

    it('renders rich options with descriptions', () => {
      render(<ExtensionUIDialog request={richOptionsRequest} onResponse={defaultOnResponse} />);
      
      expect(screen.getByText('Claude')).toBeInTheDocument();
      expect(screen.getByText('Anthropic AI')).toBeInTheDocument();
      expect(screen.getByText('GPT-4')).toBeInTheDocument();
      expect(screen.getByText('OpenAI')).toBeInTheDocument();
    });

    it('shows keyboard hints in footer', () => {
      render(<ExtensionUIDialog request={selectRequest} onResponse={defaultOnResponse} />);
      
      expect(screen.getByText(/↑↓ navigate/)).toBeInTheDocument();
      expect(screen.getByText(/Enter select/)).toBeInTheDocument();
    });

    it('navigates with j/k keys', () => {
      render(<ExtensionUIDialog request={selectRequest} onResponse={defaultOnResponse} />);
      
      fireEvent.keyDown(document, { key: 'j' });
      fireEvent.keyDown(document, { key: 'Enter' });
      
      expect(defaultOnResponse).toHaveBeenCalledWith(
        expect.objectContaining({ value: 'Option B' })
      );
    });
  });

  describe('Confirm Dialog', () => {
    const confirmRequest: ExtensionUIRequest = {
      requestId: 'req-1',
      method: 'confirm',
      title: 'Confirm Action',
      message: 'Are you sure you want to proceed?',
    };

    it('renders confirm dialog with title and message', () => {
      render(<ExtensionUIDialog request={confirmRequest} onResponse={defaultOnResponse} />);
      
      expect(screen.getByText('Confirm Action')).toBeInTheDocument();
      expect(screen.getByText('Are you sure you want to proceed?')).toBeInTheDocument();
    });

    it('has Yes and No buttons', () => {
      render(<ExtensionUIDialog request={confirmRequest} onResponse={defaultOnResponse} />);
      
      expect(screen.getByText('Yes')).toBeInTheDocument();
      expect(screen.getByText('No')).toBeInTheDocument();
    });

    it('calls onResponse with true on Yes click', () => {
      render(<ExtensionUIDialog request={confirmRequest} onResponse={defaultOnResponse} />);
      
      fireEvent.click(screen.getByText('Yes'));
      
      expect(defaultOnResponse).toHaveBeenCalledWith({
        requestId: 'req-1',
        cancelled: false,
        value: true,
      });
    });

    it('calls onResponse with cancelled on No click', () => {
      render(<ExtensionUIDialog request={confirmRequest} onResponse={defaultOnResponse} />);
      
      fireEvent.click(screen.getByText('No'));
      
      expect(defaultOnResponse).toHaveBeenCalledWith({
        requestId: 'req-1',
        cancelled: true,
      });
    });

    it('confirms with y key', () => {
      render(<ExtensionUIDialog request={confirmRequest} onResponse={defaultOnResponse} />);
      
      fireEvent.keyDown(document, { key: 'y' });
      
      expect(defaultOnResponse).toHaveBeenCalledWith({
        requestId: 'req-1',
        cancelled: false,
        value: true,
      });
    });

    it('cancels with n key', () => {
      render(<ExtensionUIDialog request={confirmRequest} onResponse={defaultOnResponse} />);
      
      fireEvent.keyDown(document, { key: 'n' });
      
      expect(defaultOnResponse).toHaveBeenCalledWith({
        requestId: 'req-1',
        cancelled: true,
      });
    });

    it('cancels with Escape key', () => {
      render(<ExtensionUIDialog request={confirmRequest} onResponse={defaultOnResponse} />);
      
      fireEvent.keyDown(document, { key: 'Escape' });
      
      expect(defaultOnResponse).toHaveBeenCalledWith({
        requestId: 'req-1',
        cancelled: true,
      });
    });

    it('shows keyboard hints', () => {
      render(<ExtensionUIDialog request={confirmRequest} onResponse={defaultOnResponse} />);
      
      expect(screen.getByText(/Y\/N/)).toBeInTheDocument();
    });
  });

  describe('Input Dialog', () => {
    const inputRequest: ExtensionUIRequest = {
      requestId: 'req-1',
      method: 'input',
      title: 'Enter Name',
      placeholder: 'Your name here...',
    };

    it('renders input dialog with title', () => {
      render(<ExtensionUIDialog request={inputRequest} onResponse={defaultOnResponse} />);
      
      expect(screen.getByText('Enter Name')).toBeInTheDocument();
    });

    it('renders input with placeholder', () => {
      render(<ExtensionUIDialog request={inputRequest} onResponse={defaultOnResponse} />);
      
      expect(screen.getByPlaceholderText('Your name here...')).toBeInTheDocument();
    });

    it('submits value on Enter', () => {
      render(<ExtensionUIDialog request={inputRequest} onResponse={defaultOnResponse} />);
      
      const input = screen.getByPlaceholderText('Your name here...');
      fireEvent.change(input, { target: { value: 'John Doe' } });
      fireEvent.keyDown(input, { key: 'Enter' });
      
      expect(defaultOnResponse).toHaveBeenCalledWith({
        requestId: 'req-1',
        cancelled: false,
        value: 'John Doe',
      });
    });

    it('cancels on Escape', () => {
      render(<ExtensionUIDialog request={inputRequest} onResponse={defaultOnResponse} />);
      
      const input = screen.getByPlaceholderText('Your name here...');
      fireEvent.keyDown(input, { key: 'Escape' });
      
      expect(defaultOnResponse).toHaveBeenCalledWith({
        requestId: 'req-1',
        cancelled: true,
      });
    });

    it('trims whitespace from value', () => {
      render(<ExtensionUIDialog request={inputRequest} onResponse={defaultOnResponse} />);
      
      const input = screen.getByPlaceholderText('Your name here...');
      fireEvent.change(input, { target: { value: '  trimmed  ' } });
      fireEvent.keyDown(input, { key: 'Enter' });
      
      expect(defaultOnResponse).toHaveBeenCalledWith({
        requestId: 'req-1',
        cancelled: false,
        value: 'trimmed',
      });
    });

    it('does not submit empty value', () => {
      render(<ExtensionUIDialog request={inputRequest} onResponse={defaultOnResponse} />);
      
      const input = screen.getByPlaceholderText('Your name here...');
      fireEvent.keyDown(input, { key: 'Enter' });
      
      expect(defaultOnResponse).not.toHaveBeenCalled();
    });

    it('has submit button', () => {
      render(<ExtensionUIDialog request={inputRequest} onResponse={defaultOnResponse} />);
      expect(screen.getByText('Submit')).toBeInTheDocument();
    });

    it('has cancel button', () => {
      render(<ExtensionUIDialog request={inputRequest} onResponse={defaultOnResponse} />);
      expect(screen.getByText('Cancel')).toBeInTheDocument();
    });
  });

  describe('Editor Dialog', () => {
    const editorRequest: ExtensionUIRequest = {
      requestId: 'req-1',
      method: 'editor',
      title: 'Edit Code',
      prefill: 'const x = 1;',
    };

    it('renders editor dialog with title', () => {
      render(<ExtensionUIDialog request={editorRequest} onResponse={defaultOnResponse} />);
      
      expect(screen.getByText('Edit Code')).toBeInTheDocument();
    });

    it('prefills textarea with content', () => {
      render(<ExtensionUIDialog request={editorRequest} onResponse={defaultOnResponse} />);
      
      const textarea = screen.getByRole('textbox');
      expect(textarea).toHaveValue('const x = 1;');
    });

    it('has submit and cancel buttons', () => {
      render(<ExtensionUIDialog request={editorRequest} onResponse={defaultOnResponse} />);
      
      expect(screen.getByText('Submit')).toBeInTheDocument();
      expect(screen.getByText('Cancel')).toBeInTheDocument();
    });

    it('submits on button click', () => {
      render(<ExtensionUIDialog request={editorRequest} onResponse={defaultOnResponse} />);
      
      fireEvent.click(screen.getByText('Submit'));
      
      expect(defaultOnResponse).toHaveBeenCalledWith({
        requestId: 'req-1',
        cancelled: false,
        value: 'const x = 1;',
      });
    });

    it('cancels on Cancel button click', () => {
      render(<ExtensionUIDialog request={editorRequest} onResponse={defaultOnResponse} />);
      
      fireEvent.click(screen.getByText('Cancel'));
      
      expect(defaultOnResponse).toHaveBeenCalledWith({
        requestId: 'req-1',
        cancelled: true,
      });
    });

    it('submits on button click', () => {
      render(<ExtensionUIDialog request={editorRequest} onResponse={defaultOnResponse} />);
      
      fireEvent.click(screen.getByText('Submit'));
      
      expect(defaultOnResponse).toHaveBeenCalledWith({
        requestId: 'req-1',
        cancelled: false,
        value: 'const x = 1;',
      });
    });

    it('shows cancel hint', () => {
      render(<ExtensionUIDialog request={editorRequest} onResponse={defaultOnResponse} />);
      
      expect(screen.getByText(/Esc to cancel/)).toBeInTheDocument();
    });
  });

  describe('Timeout', () => {
    it('shows timeout countdown for select', () => {
      const requestWithTimeout: ExtensionUIRequest = {
        requestId: 'req-1',
        method: 'select',
        title: 'Choose quickly',
        options: ['A', 'B'],
        timeout: 10000,
      };
      
      render(<ExtensionUIDialog request={requestWithTimeout} onResponse={defaultOnResponse} />);
      
      expect(screen.getByText('10s')).toBeInTheDocument();
    });
  });

  describe('Unknown Method', () => {
    it('renders nothing for unknown method', () => {
      const unknownRequest = {
        requestId: 'req-1',
        method: 'unknown' as any,
        title: 'Unknown',
      };
      
      const { container } = render(
        <ExtensionUIDialog request={unknownRequest} onResponse={defaultOnResponse} />
      );
      
      expect(container.firstChild).toBeNull();
    });
  });
});
