import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useIsMobile } from '../../../src/hooks/useIsMobile';

describe('useIsMobile', () => {
  const originalInnerWidth = window.innerWidth;

  function setWindowWidth(width: number) {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: width,
    });
  }

  afterEach(() => {
    setWindowWidth(originalInnerWidth);
  });

  it('returns true when window width is less than 768px', () => {
    setWindowWidth(500);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
  });

  it('returns false when window width is 768px or more', () => {
    setWindowWidth(1024);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });

  it('returns false at exactly 768px', () => {
    setWindowWidth(768);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });

  it('updates when window is resized', async () => {
    setWindowWidth(1024);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);

    // Simulate resize to mobile
    act(() => {
      setWindowWidth(500);
      window.dispatchEvent(new Event('resize'));
    });

    // Wait for debounce (150ms + buffer)
    await act(async () => {
      await new Promise(r => setTimeout(r, 200));
    });

    expect(result.current).toBe(true);
  });

  it('updates when resizing from mobile to desktop', async () => {
    setWindowWidth(500);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);

    // Simulate resize to desktop
    act(() => {
      setWindowWidth(1024);
      window.dispatchEvent(new Event('resize'));
    });

    // Wait for debounce (150ms + buffer)
    await act(async () => {
      await new Promise(r => setTimeout(r, 200));
    });

    expect(result.current).toBe(false);
  });

  it('cleans up event listener on unmount', () => {
    const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');
    const { unmount } = renderHook(() => useIsMobile());
    
    unmount();
    
    expect(removeEventListenerSpy).toHaveBeenCalledWith('resize', expect.any(Function));
    removeEventListenerSpy.mockRestore();
  });
});
