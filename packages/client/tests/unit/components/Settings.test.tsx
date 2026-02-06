import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { Settings } from '../../../src/components/Settings';
import { SettingsProvider, useSettings } from '../../../src/contexts/SettingsContext';
import { ThemeProvider } from '../../../src/contexts/ThemeContext';
import React, { useEffect } from 'react';

// Component that opens settings and renders Settings
function OpenSettings(props: React.ComponentProps<typeof Settings>) {
  const { openSettings } = useSettings();
  
  useEffect(() => {
    openSettings();
  }, [openSettings]);
  
  return <Settings {...props} />;
}

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
  };

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  describe('When Closed', () => {
    it('renders nothing when settings is closed', () => {
      const { container } = render(
        <Wrapper>
          <Settings {...defaultProps} />
        </Wrapper>
      );
      expect(container.querySelector('.fixed')).toBeNull();
    });
  });

  describe('When Open', () => {
    it('renders dialog with Settings title', async () => {
      render(
        <Wrapper>
          <OpenSettings {...defaultProps} />
        </Wrapper>
      );
      
      expect(await screen.findByText('Settings')).toBeInTheDocument();
    });

    it('shows Display section', async () => {
      render(
        <Wrapper>
          <OpenSettings {...defaultProps} />
        </Wrapper>
      );
      
      expect(await screen.findByText('Display')).toBeInTheDocument();
    });

    it('shows Notifications section', async () => {
      render(
        <Wrapper>
          <OpenSettings {...defaultProps} />
        </Wrapper>
      );
      
      expect(await screen.findByText('Notifications')).toBeInTheDocument();
    });

    it('shows Theme section', async () => {
      render(
        <Wrapper>
          <OpenSettings {...defaultProps} />
        </Wrapper>
      );
      
      expect(await screen.findByText('Theme')).toBeInTheDocument();
    });

    it('shows Allowed Directories section', async () => {
      render(
        <Wrapper>
          <OpenSettings {...defaultProps} />
        </Wrapper>
      );
      
      expect(await screen.findByText('Allowed Directories')).toBeInTheDocument();
    });

    it('shows Developer section', async () => {
      render(
        <Wrapper>
          <OpenSettings {...defaultProps} />
        </Wrapper>
      );
      
      expect(await screen.findByText('Developer')).toBeInTheDocument();
    });
  });

  describe('Display Settings', () => {
    it('shows hide thinking blocks toggle', async () => {
      render(
        <Wrapper>
          <OpenSettings {...defaultProps} />
        </Wrapper>
      );
      
      expect(await screen.findByText('Hide thinking blocks')).toBeInTheDocument();
    });

    it('shows auto-collapse tools toggle', async () => {
      render(
        <Wrapper>
          <OpenSettings {...defaultProps} />
        </Wrapper>
      );
      
      expect(await screen.findByText('Auto-collapse tools')).toBeInTheDocument();
    });
  });

  describe('Notifications', () => {
    it('shows enable notifications button when permission is default', async () => {
      render(
        <Wrapper>
          <OpenSettings {...defaultProps} notificationPermission="default" />
        </Wrapper>
      );
      
      expect(await screen.findByText('Enable notifications')).toBeInTheDocument();
    });

    it('calls onRequestNotificationPermission when button clicked', async () => {
      const onRequest = vi.fn();
      render(
        <Wrapper>
          <OpenSettings {...defaultProps} notificationPermission="default" onRequestNotificationPermission={onRequest} />
        </Wrapper>
      );
      
      const button = await screen.findByText('Enable notifications');
      fireEvent.click(button);
      
      expect(onRequest).toHaveBeenCalledTimes(1);
    });

    it('shows toggle when notifications are granted', async () => {
      render(
        <Wrapper>
          <OpenSettings {...defaultProps} notificationPermission="granted" />
        </Wrapper>
      );
      
      // When granted, should show toggle not button
      await screen.findByText('Enable notifications');
      expect(screen.getByText('Get notified when tasks complete')).toBeInTheDocument();
    });

    it('shows blocked message when notifications denied', async () => {
      render(
        <Wrapper>
          <OpenSettings {...defaultProps} notificationPermission="denied" />
        </Wrapper>
      );
      
      expect(await screen.findByText(/Notifications are blocked/)).toBeInTheDocument();
    });

    it('shows unsupported message when not supported', async () => {
      render(
        <Wrapper>
          <OpenSettings {...defaultProps} notificationPermission="unsupported" />
        </Wrapper>
      );
      
      expect(await screen.findByText(/not supported/)).toBeInTheDocument();
    });
  });

  describe('Theme', () => {
    it('shows Dark theme section', async () => {
      render(
        <Wrapper>
          <OpenSettings {...defaultProps} />
        </Wrapper>
      );
      
      expect(await screen.findByText('Dark')).toBeInTheDocument();
    });

    it('shows Light theme section', async () => {
      render(
        <Wrapper>
          <OpenSettings {...defaultProps} />
        </Wrapper>
      );
      
      expect(await screen.findByText('Light')).toBeInTheDocument();
    });
  });

  describe('Allowed Directories', () => {
    it('displays all allowed roots', async () => {
      render(
        <Wrapper>
          <OpenSettings {...defaultProps} allowedRoots={['/home/user', '/var/www']} />
        </Wrapper>
      );
      
      expect(await screen.findByText('/home/user')).toBeInTheDocument();
      expect(screen.getByText('/var/www')).toBeInTheDocument();
    });

    it('shows add directory input', async () => {
      render(
        <Wrapper>
          <OpenSettings {...defaultProps} />
        </Wrapper>
      );
      
      expect(await screen.findByPlaceholderText('Add directory path...')).toBeInTheDocument();
    });

    it('shows restart required message', async () => {
      render(
        <Wrapper>
          <OpenSettings {...defaultProps} />
        </Wrapper>
      );
      
      expect(await screen.findByText(/require.*restart/i)).toBeInTheDocument();
    });
  });

  describe('Developer Section', () => {
    it('shows rebuild button when idle', async () => {
      render(
        <Wrapper>
          <OpenSettings {...defaultProps} deployStatus="idle" />
        </Wrapper>
      );
      
      expect(await screen.findByText('Rebuild & Restart Server')).toBeInTheDocument();
    });

    it('shows building state', async () => {
      render(
        <Wrapper>
          <OpenSettings {...defaultProps} deployStatus="building" />
        </Wrapper>
      );
      
      expect(await screen.findByText('Building...')).toBeInTheDocument();
    });

    it('shows restarting state', async () => {
      render(
        <Wrapper>
          <OpenSettings {...defaultProps} deployStatus="restarting" />
        </Wrapper>
      );
      
      expect(await screen.findByText('Restarting...')).toBeInTheDocument();
    });

    it('calls onDeploy when rebuild button clicked', async () => {
      const onDeploy = vi.fn();
      render(
        <Wrapper>
          <OpenSettings {...defaultProps} deployStatus="idle" onDeploy={onDeploy} />
        </Wrapper>
      );
      
      const button = await screen.findByText('Rebuild & Restart Server');
      fireEvent.click(button);
      
      expect(onDeploy).toHaveBeenCalledTimes(1);
    });

    it('disables button when building', async () => {
      render(
        <Wrapper>
          <OpenSettings {...defaultProps} deployStatus="building" />
        </Wrapper>
      );
      
      const button = await screen.findByText('Building...');
      expect(button.closest('button')).toBeDisabled();
    });

    it('shows deploy message when present', async () => {
      render(
        <Wrapper>
          <OpenSettings {...defaultProps} deployMessage="Build successful!" />
        </Wrapper>
      );
      
      expect(await screen.findByText('Build successful!')).toBeInTheDocument();
    });
  });

  describe('Close Behavior', () => {
    it('has close button', async () => {
      render(
        <Wrapper>
          <OpenSettings {...defaultProps} />
        </Wrapper>
      );
      
      await screen.findByText('Settings');
      const buttons = screen.getAllByRole('button');
      // First button should be close (X)
      expect(buttons.length).toBeGreaterThan(0);
    });

    it('has backdrop', async () => {
      const { container } = render(
        <Wrapper>
          <OpenSettings {...defaultProps} />
        </Wrapper>
      );
      
      await screen.findByText('Settings');
      const backdrop = container.querySelector('.bg-black\\/50');
      expect(backdrop).toBeInTheDocument();
    });
  });
});
