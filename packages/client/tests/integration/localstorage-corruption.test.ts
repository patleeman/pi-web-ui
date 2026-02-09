import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSettings } from '../../src/contexts/SettingsContext';
import { SettingsProvider } from '../../src/contexts/SettingsContext';

describe('LocalStorage Corruption Handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('handles corrupted JSON in settings', () => {
    localStorage.setItem('pi-settings', '{invalid json}');

    const { result } = renderHook(() => useSettings(), {
      wrapper: SettingsProvider,
    });

    // Should use default settings without crashing
    expect(result.current.settings).toBeDefined();
    expect(result.current.settings.autoCollapseThinking).toBe(false);
  });

  it('handles null values in localStorage', () => {
    localStorage.setItem('pi-settings', 'null');

    const { result } = renderHook(() => useSettings(), {
      wrapper: SettingsProvider,
    });

    expect(result.current.settings).toBeDefined();
  });

  it('handles undefined localStorage', () => {
    localStorage.setItem('pi-settings', 'undefined');

    const { result } = renderHook(() => useSettings(), {
      wrapper: SettingsProvider,
    });

    expect(result.current.settings).toBeDefined();
  });

  it('handles empty string in localStorage', () => {
    localStorage.setItem('pi-settings', '');

    const { result } = renderHook(() => useSettings(), {
      wrapper: SettingsProvider,
    });

    expect(result.current.settings).toBeDefined();
  });

  it('handles very large localStorage value', () => {
    const largeValue = JSON.stringify({
      autoCollapseThinking: true,
      largeArray: new Array(10000).fill('x'),
    });
    localStorage.setItem('pi-settings', largeValue);

    const { result } = renderHook(() => useSettings(), {
      wrapper: SettingsProvider,
    });

    expect(result.current.settings).toBeDefined();
  });

  it('handles localStorage quota exceeded', () => {
    const mockSetItem = vi.spyOn(Storage.prototype, 'setItem');
    mockSetItem.mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });

    const { result } = renderHook(() => useSettings(), {
      wrapper: SettingsProvider,
    });

    // Should not throw when trying to save
    act(() => {
      result.current.updateSettings({ autoCollapseThinking: true });
    });

    expect(result.current.settings.autoCollapseThinking).toBe(true);
    mockSetItem.mockRestore();
  });

  it('handles localStorage being disabled', () => {
    const mockGetItem = vi.spyOn(Storage.prototype, 'getItem');
    mockGetItem.mockImplementation(() => {
      throw new Error('Storage disabled');
    });

    // Should not throw
    expect(() => {
      renderHook(() => useSettings(), {
        wrapper: SettingsProvider,
      });
    }).not.toThrow();

    mockGetItem.mockRestore();
  });

  it('recovers from partial settings corruption', () => {
    const partialSettings = {
      autoCollapseThinking: true,
      // Missing other required fields
    };
    localStorage.setItem('pi-settings', JSON.stringify(partialSettings));

    const { result } = renderHook(() => useSettings(), {
      wrapper: SettingsProvider,
    });

    // Should merge with defaults
    expect(result.current.settings.autoCollapseThinking).toBe(true);
    expect(result.current.settings.notificationsEnabled).toBeDefined();
  });

  it('handles wrong data types in localStorage', () => {
    localStorage.setItem('pi-settings', JSON.stringify({
      autoCollapseThinking: 'yes', // Should be boolean
      notificationsEnabled: 1, // Should be boolean
    }));

    const { result } = renderHook(() => useSettings(), {
      wrapper: SettingsProvider,
    });

    // Should handle gracefully
    expect(result.current.settings).toBeDefined();
  });
});
