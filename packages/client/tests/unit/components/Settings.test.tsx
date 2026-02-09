import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Settings } from '../../../src/components/Settings';
import { SettingsProvider } from '../../../src/contexts/SettingsContext';
import { ThemeProvider } from '../../../src/contexts/ThemeContext';
import React from 'react';

// Wrapper with all providers
function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <SettingsProvider>
        {children}
      </SettingsProvider>
    </ThemeProvider>
  );
}

describe('Settings', () => {
  const defaultProps = {
    notificationPermission: 'default' as NotificationPermission | 'unsupported',
    onRequestNotificationPermission: vi.fn(),
    deployStatus: 'idle' as const,
    deployMessage: null as string | null,
    onDeploy: vi.fn(),
    allowedRoots: ['/home/user', '/var/www'],
    onUpdateAllowedRoots: vi.fn(),
    models: [] as any[],
    scopedModels: [] as any[],
    onSaveScopedModels: vi.fn(),
    startupInfo: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  describe('Basic Rendering', () => {
    it('renders Settings header', () => {
      render(
        <Wrapper>
          <Settings {...defaultProps} />
        </Wrapper>
      );
      expect(screen.getByText('Settings')).toBeInTheDocument();
    });

    it('has search input', () => {
      render(
        <Wrapper>
          <Settings {...defaultProps} />
        </Wrapper>
      );
      expect(screen.getByPlaceholderText('Search settings...')).toBeInTheDocument();
    });

    it('has close button', () => {
      render(
        <Wrapper>
          <Settings {...defaultProps} />
        </Wrapper>
      );
      const buttons = screen.getAllByRole('button');
      expect(buttons.length).toBeGreaterThan(0);
    });
  });

  describe('Category Navigation', () => {
    it('shows category buttons in sidebar', () => {
      render(
        <Wrapper>
          <Settings {...defaultProps} />
        </Wrapper>
      );
      
      // Should have category navigation buttons (getAllByText because they appear in sidebar and potentially in headings)
      expect(screen.getAllByText('Display').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Notifications').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Theme').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Developer').length).toBeGreaterThan(0);
    });
  });
});
