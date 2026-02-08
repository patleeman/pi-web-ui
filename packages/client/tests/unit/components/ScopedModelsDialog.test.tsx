import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ScopedModelsDialog } from '../../../src/components/ScopedModelsDialog';
import type { ModelInfo, ScopedModelInfo } from '@pi-deck/shared';

describe('ScopedModelsDialog', () => {
  const mockModels: ModelInfo[] = [
    { provider: 'anthropic', id: 'claude-sonnet-4', name: 'Claude Sonnet 4' },
    { provider: 'anthropic', id: 'claude-opus-4', name: 'Claude Opus 4' },
    { provider: 'openai', id: 'gpt-4o', name: 'GPT-4o' },
  ];

  const mockScopedModels: ScopedModelInfo[] = [
    { 
      provider: 'anthropic', 
      modelId: 'claude-sonnet-4', 
      modelName: 'Claude Sonnet 4',
      thinkingLevel: 'medium',
      enabled: true,
    },
  ];

  const defaultProps = {
    isOpen: true,
    models: mockModels,
    scopedModels: mockScopedModels,
    onSave: vi.fn(),
    onClose: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Visibility', () => {
    it('renders nothing when closed', () => {
      const { container } = render(<ScopedModelsDialog {...defaultProps} isOpen={false} />);
      expect(container.firstChild).toBeNull();
    });

    it('renders dialog when open', () => {
      render(<ScopedModelsDialog {...defaultProps} />);
      expect(screen.getByText('Scoped Models')).toBeInTheDocument();
    });
  });

  describe('Header', () => {
    it('shows dialog title', () => {
      render(<ScopedModelsDialog {...defaultProps} />);
      expect(screen.getByText('Scoped Models')).toBeInTheDocument();
    });

    it('shows count of selected models', () => {
      render(<ScopedModelsDialog {...defaultProps} />);
      expect(screen.getByText(/1 selected for Ctrl\+P cycling/)).toBeInTheDocument();
    });

    it('has close button', () => {
      const { container } = render(<ScopedModelsDialog {...defaultProps} />);
      const closeIcon = container.querySelector('.lucide-x');
      expect(closeIcon).toBeInTheDocument();
    });
  });

  describe('Description', () => {
    it('shows description of scoped models feature', () => {
      render(<ScopedModelsDialog {...defaultProps} />);
      expect(screen.getByText(/Select models to include in Ctrl\+P/)).toBeInTheDocument();
    });
  });

  describe('Model List', () => {
    it('renders all available models', () => {
      render(<ScopedModelsDialog {...defaultProps} />);
      
      expect(screen.getByText('Claude Sonnet 4')).toBeInTheDocument();
      expect(screen.getByText('Claude Opus 4')).toBeInTheDocument();
      expect(screen.getByText('GPT-4o')).toBeInTheDocument();
    });

    it('shows provider for each model', () => {
      render(<ScopedModelsDialog {...defaultProps} />);
      
      const anthropicElements = screen.getAllByText('anthropic');
      expect(anthropicElements.length).toBe(2);
      expect(screen.getByText('openai')).toBeInTheDocument();
    });

    it('shows empty state when no models', () => {
      render(<ScopedModelsDialog {...defaultProps} models={[]} />);
      expect(screen.getByText('No models available')).toBeInTheDocument();
    });

    it('shows checkmark for enabled models', () => {
      const { container } = render(<ScopedModelsDialog {...defaultProps} />);
      const checkmarks = container.querySelectorAll('.lucide-check');
      expect(checkmarks.length).toBe(1); // One model enabled
    });
  });

  describe('Model Selection', () => {
    it('toggling model updates selection', () => {
      render(<ScopedModelsDialog {...defaultProps} />);
      
      // Click on GPT-4o to enable it
      const gpt4Row = screen.getByText('GPT-4o').closest('div[class*="flex items-center"]');
      const checkbox = gpt4Row?.querySelector('button');
      fireEvent.click(checkbox!);
      
      // Now should show 2 selected
      expect(screen.getByText(/2 selected for Ctrl\+P cycling/)).toBeInTheDocument();
    });

    it('enabled model checkbox has accent background', () => {
      const { container } = render(<ScopedModelsDialog {...defaultProps} />);
      
      const enabledCheckbox = container.querySelector('.bg-pi-accent');
      expect(enabledCheckbox).toBeInTheDocument();
    });
  });

  describe('Thinking Level', () => {
    it('shows thinking level dropdown for each model', () => {
      render(<ScopedModelsDialog {...defaultProps} />);
      
      const selects = screen.getAllByRole('combobox');
      expect(selects.length).toBe(mockModels.length);
    });

    it('thinking level options include all levels', () => {
      render(<ScopedModelsDialog {...defaultProps} />);
      
      const select = screen.getAllByRole('combobox')[0];
      expect(select).toContainHTML('Off');
      expect(select).toContainHTML('minimal');
      expect(select).toContainHTML('low');
      expect(select).toContainHTML('medium');
      expect(select).toContainHTML('high');
      expect(select).toContainHTML('xhigh');
    });

    it('disabled models have disabled thinking level selector', () => {
      render(<ScopedModelsDialog {...defaultProps} />);
      
      // GPT-4o is not enabled, its select should be disabled
      const selects = screen.getAllByRole('combobox');
      const gpt4Select = selects[2]; // Third model
      expect(gpt4Select).toBeDisabled();
    });

    it('enabled models have active thinking level selector', () => {
      render(<ScopedModelsDialog {...defaultProps} />);
      
      const selects = screen.getAllByRole('combobox');
      const sonnetSelect = selects[0]; // First model (enabled)
      expect(sonnetSelect).not.toBeDisabled();
    });
  });

  describe('Keyboard Navigation', () => {
    it('Escape closes dialog', () => {
      const onClose = vi.fn();
      render(<ScopedModelsDialog {...defaultProps} onClose={onClose} />);
      
      fireEvent.keyDown(document, { key: 'Escape' });
      
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('Ctrl+Enter saves', () => {
      const onSave = vi.fn();
      const onClose = vi.fn();
      render(<ScopedModelsDialog {...defaultProps} onSave={onSave} onClose={onClose} />);
      
      fireEvent.keyDown(document, { key: 'Enter', ctrlKey: true });
      
      expect(onSave).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });

    it('Cmd+Enter saves on Mac', () => {
      const onSave = vi.fn();
      const onClose = vi.fn();
      render(<ScopedModelsDialog {...defaultProps} onSave={onSave} onClose={onClose} />);
      
      fireEvent.keyDown(document, { key: 'Enter', metaKey: true });
      
      expect(onSave).toHaveBeenCalled();
    });
  });

  describe('Footer Buttons', () => {
    it('shows Clear All button', () => {
      render(<ScopedModelsDialog {...defaultProps} />);
      expect(screen.getByText('Clear All')).toBeInTheDocument();
    });

    it('shows Cancel button', () => {
      render(<ScopedModelsDialog {...defaultProps} />);
      expect(screen.getByText('Cancel')).toBeInTheDocument();
    });

    it('shows Save button', () => {
      render(<ScopedModelsDialog {...defaultProps} />);
      expect(screen.getByText('Save')).toBeInTheDocument();
    });

    it('Clear All button clears all selections', () => {
      render(<ScopedModelsDialog {...defaultProps} />);
      
      fireEvent.click(screen.getByText('Clear All'));
      
      expect(screen.getByText(/0 selected for Ctrl\+P cycling/)).toBeInTheDocument();
    });

    it('Cancel button closes dialog', () => {
      const onClose = vi.fn();
      render(<ScopedModelsDialog {...defaultProps} onClose={onClose} />);
      
      fireEvent.click(screen.getByText('Cancel'));
      
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('Save button saves enabled models', () => {
      const onSave = vi.fn();
      render(<ScopedModelsDialog {...defaultProps} onSave={onSave} />);
      
      fireEvent.click(screen.getByText('Save'));
      
      expect(onSave).toHaveBeenCalledWith([
        expect.objectContaining({
          provider: 'anthropic',
          modelId: 'claude-sonnet-4',
          thinkingLevel: 'medium',
        }),
      ]);
    });
  });

  describe('Backdrop', () => {
    it('clicking backdrop closes dialog', () => {
      const onClose = vi.fn();
      const { container } = render(<ScopedModelsDialog {...defaultProps} onClose={onClose} />);
      
      const backdrop = container.querySelector('.bg-black\\/50');
      fireEvent.click(backdrop!);
      
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('Keyboard Hint', () => {
    it('shows keyboard shortcut hint', () => {
      render(<ScopedModelsDialog {...defaultProps} />);
      expect(screen.getByText(/⌘Enter to save/)).toBeInTheDocument();
    });
  });

  describe('Styling', () => {
    it('dialog is centered on screen', () => {
      const { container } = render(<ScopedModelsDialog {...defaultProps} />);
      
      const dialog = container.querySelector('.fixed.top-1\\/2.left-1\\/2');
      expect(dialog).toBeInTheDocument();
    });

    it('dialog has max height with scroll', () => {
      const { container } = render(<ScopedModelsDialog {...defaultProps} />);
      
      const dialog = container.querySelector('.max-h-\\[80vh\\]');
      expect(dialog).toBeInTheDocument();
    });
  });
});
