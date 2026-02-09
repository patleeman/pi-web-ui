import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { ThemeProvider, useTheme } from '../../../src/contexts/ThemeContext';
import React from 'react';

describe('ThemeContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('provides theme context without crashing', () => {
    const { result } = renderHook(() => useTheme(), {
      wrapper: ThemeProvider,
    });

    expect(result.current).toBeDefined();
    expect(result.current.theme).toBeDefined();
    expect(typeof result.current.setTheme).toBe('function');
    expect(typeof result.current.setThemeById).toBe('function');
    expect(Array.isArray(result.current.themes)).toBe(true);
    expect(Array.isArray(result.current.darkThemes)).toBe(true);
    expect(Array.isArray(result.current.lightThemes)).toBe(true);
  });

  it('throws error when useTheme is used outside ThemeProvider', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Should throw when rendered without provider
    expect(() => {
      renderHook(() => useTheme());
    }).toThrow('useTheme must be used within a ThemeProvider');

    consoleSpy.mockRestore();
  });

  it('loads theme from localStorage', () => {
    localStorage.setItem('pi-theme', 'dark');

    const { result } = renderHook(() => useTheme(), {
      wrapper: ThemeProvider,
    });

    // Should have attempted to load theme
    expect(result.current).toBeDefined();
    expect(result.current.theme).toBeDefined();
  });

  it('handles corrupted localStorage gracefully', () => {
    const mockGetItem = vi.spyOn(Storage.prototype, 'getItem');
    mockGetItem.mockImplementation(() => {
      throw new Error('Storage error');
    });

    // Should not throw
    expect(() => {
      renderHook(() => useTheme(), {
        wrapper: ThemeProvider,
      });
    }).not.toThrow();

    mockGetItem.mockRestore();
  });
});
