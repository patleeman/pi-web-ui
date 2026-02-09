import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { SettingsProvider, useSettings } from '../../../src/contexts/SettingsContext';
import React from 'react';

// Test component that uses settings
function TestComponent() {
  const { settings, updateSettings, openSettings, closeSettings, openSettingsCategory, isSettingsOpen } = useSettings();
  return (
    <div>
      <div data-testid="settings-open">{isSettingsOpen ? 'open' : 'closed'}</div>
      <div data-testid="category">{openSettingsCategory || 'none'}</div>
      <div data-testid="auto-collapse">{settings.autoCollapseThinking ? 'true' : 'false'}</div>
      <div data-testid="notifications">{settings.notificationsEnabled ? 'true' : 'false'}</div>
      <button onClick={() => openSettings()}>Open Settings</button>
      <button onClick={() => openSettings('display')}>Open Display</button>
      <button onClick={closeSettings}>Close Settings</button>
      <button onClick={() => updateSettings({ autoCollapseThinking: true })}>Enable Auto Collapse</button>
      <button onClick={() => updateSettings({ notificationsEnabled: true })}>Enable Notifications</button>
    </div>
  );
}

describe('SettingsContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('provides default settings', () => {
    render(
      <SettingsProvider>
        <TestComponent />
      </SettingsProvider>
    );

    expect(screen.getByTestId('settings-open').textContent).toBe('closed');
    expect(screen.getByTestId('category').textContent).toBe('none');
  });

  it('opens settings when openSettings is called', () => {
    render(
      <SettingsProvider>
        <TestComponent />
      </SettingsProvider>
    );

    fireEvent.click(screen.getByText('Open Settings'));

    expect(screen.getByTestId('settings-open').textContent).toBe('open');
  });

  it('opens settings with specific category', () => {
    render(
      <SettingsProvider>
        <TestComponent />
      </SettingsProvider>
    );

    fireEvent.click(screen.getByText('Open Display'));

    expect(screen.getByTestId('settings-open').textContent).toBe('open');
    expect(screen.getByTestId('category').textContent).toBe('display');
  });

  it('closes settings when closeSettings is called', () => {
    render(
      <SettingsProvider>
        <TestComponent />
      </SettingsProvider>
    );

    fireEvent.click(screen.getByText('Open Settings'));
    expect(screen.getByTestId('settings-open').textContent).toBe('open');

    fireEvent.click(screen.getByText('Close Settings'));
    expect(screen.getByTestId('settings-open').textContent).toBe('closed');
  });

  it('updates settings when updateSettings is called', () => {
    render(
      <SettingsProvider>
        <TestComponent />
      </SettingsProvider>
    );

    expect(screen.getByTestId('auto-collapse').textContent).toBe('false');

    fireEvent.click(screen.getByText('Enable Auto Collapse'));

    expect(screen.getByTestId('auto-collapse').textContent).toBe('true');
  });

  it('persists settings to localStorage', async () => {
    render(
      <SettingsProvider>
        <TestComponent />
      </SettingsProvider>
    );

    fireEvent.click(screen.getByText('Enable Notifications'));

    await waitFor(() => {
      const stored = localStorage.getItem('pi-settings');
      expect(stored).toContain('notificationsEnabled');
    });
  });

  it('loads saved settings from localStorage on mount', () => {
    const savedSettings = {
      autoCollapseThinking: true,
      autoCollapseTools: false,
      notificationsEnabled: true,
      defaultModelKey: 'test-model',
    };
    localStorage.setItem('pi-settings', JSON.stringify(savedSettings));

    render(
      <SettingsProvider>
        <TestComponent />
      </SettingsProvider>
    );

    expect(screen.getByTestId('auto-collapse').textContent).toBe('true');
    expect(screen.getByTestId('notifications').textContent).toBe('true');
  });

  it('handles corrupted localStorage gracefully', () => {
    localStorage.setItem('pi-settings', 'not-valid-json');

    // Should not throw
    expect(() => {
      render(
        <SettingsProvider>
          <TestComponent />
        </SettingsProvider>
      );
    }).not.toThrow();
  });

  it('handles localStorage errors gracefully', () => {
    const mockSetItem = vi.spyOn(Storage.prototype, 'setItem');
    mockSetItem.mockImplementation(() => {
      throw new Error('Storage full');
    });

    // Should not throw
    expect(() => {
      render(
        <SettingsProvider>
          <TestComponent />
        </SettingsProvider>
      );
      fireEvent.click(screen.getByText('Enable Auto Collapse'));
    }).not.toThrow();

    mockSetItem.mockRestore();
  });

  it('merges partial updates with existing settings', () => {
    render(
      <SettingsProvider>
        <TestComponent />
      </SettingsProvider>
    );

    fireEvent.click(screen.getByText('Enable Auto Collapse'));
    expect(screen.getByTestId('auto-collapse').textContent).toBe('true');

    fireEvent.click(screen.getByText('Enable Notifications'));
    expect(screen.getByTestId('notifications').textContent).toBe('true');
    // Previous setting should persist
    expect(screen.getByTestId('auto-collapse').textContent).toBe('true');
  });

  it('throws error when useSettings is used outside SettingsProvider', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    function ComponentWithoutProvider() {
      useSettings();
      return null;
    }

    expect(() => {
      render(<ComponentWithoutProvider />);
    }).toThrow('useSettings must be used within a SettingsProvider');

    consoleSpy.mockRestore();
  });

  it('handles hotkey overrides updates', () => {
    function HotkeyTestComponent() {
      const { settings, updateSettings } = useSettings();
      return (
        <div>
          <div data-testid="hotkeys">{JSON.stringify(settings.hotkeyOverrides)}</div>
          <button onClick={() => updateSettings({ hotkeyOverrides: { sendMessage: 'Ctrl+Enter' } })}>
            Update Hotkey
          </button>
        </div>
      );
    }

    render(
      <SettingsProvider>
        <HotkeyTestComponent />
      </SettingsProvider>
    );

    expect(screen.getByTestId('hotkeys').textContent).toBe('{}');

    fireEvent.click(screen.getByText('Update Hotkey'));

    expect(screen.getByTestId('hotkeys').textContent).toContain('Ctrl+Enter');
  });
});