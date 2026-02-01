import { useCallback, useEffect, useRef, useState } from 'react';

interface UseNotificationsOptions {
  /** Title prefix for the tab (e.g., "Pi") */
  titlePrefix?: string;
  /** Whether notifications are enabled */
  enabled?: boolean;
}

interface UseNotificationsReturn {
  /** Whether browser notifications are supported */
  isSupported: boolean;
  /** Current notification permission status */
  permission: NotificationPermission | 'unsupported';
  /** Whether there's an unread notification (tab indicator) */
  hasUnread: boolean;
  /** Request notification permission */
  requestPermission: () => Promise<boolean>;
  /** Show a notification (if permitted and tab not focused) */
  notify: (title: string, options?: NotificationOptions) => void;
  /** Mark notifications as read (clears tab indicator) */
  markRead: () => void;
}

const ORIGINAL_TITLE = document.title;

export function useNotifications(options: UseNotificationsOptions = {}): UseNotificationsReturn {
  const { titlePrefix = 'Pi', enabled = true } = options;
  
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(() => {
    if (typeof Notification === 'undefined') return 'unsupported';
    return Notification.permission;
  });
  const [hasUnread, setHasUnread] = useState(false);
  const isSupported = typeof Notification !== 'undefined';
  
  // Track if tab is focused
  const isTabFocused = useRef(document.hasFocus());
  
  // Update focus state
  useEffect(() => {
    const handleFocus = () => {
      isTabFocused.current = true;
      // Clear unread when tab gains focus
      setHasUnread(false);
    };
    
    const handleBlur = () => {
      isTabFocused.current = false;
    };
    
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        isTabFocused.current = true;
        setHasUnread(false);
      } else {
        isTabFocused.current = false;
      }
    };
    
    window.addEventListener('focus', handleFocus);
    window.addEventListener('blur', handleBlur);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('blur', handleBlur);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);
  
  // Update tab title when hasUnread changes
  useEffect(() => {
    if (hasUnread) {
      document.title = `(●) ${titlePrefix}`;
    } else {
      document.title = ORIGINAL_TITLE;
    }
    
    return () => {
      document.title = ORIGINAL_TITLE;
    };
  }, [hasUnread, titlePrefix]);
  
  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (!isSupported) return false;
    
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      return result === 'granted';
    } catch {
      return false;
    }
  }, [isSupported]);
  
  const notify = useCallback((title: string, notificationOptions?: NotificationOptions) => {
    if (!enabled) return;
    
    // Always set unread indicator (for tab title)
    if (!isTabFocused.current) {
      setHasUnread(true);
    }
    
    // Show browser notification if permitted and tab not focused
    if (isSupported && permission === 'granted' && !isTabFocused.current) {
      try {
        const notification = new Notification(title, {
          icon: '/pi.svg',
          badge: '/pi.svg',
          tag: 'pi-agent', // Replace previous notifications
          ...notificationOptions,
        });
        
        // Focus tab when notification clicked
        notification.onclick = () => {
          window.focus();
          notification.close();
        };
        
        // Auto-close after 5 seconds
        setTimeout(() => notification.close(), 5000);
      } catch (e) {
        console.warn('Failed to show notification:', e);
      }
    }
  }, [enabled, isSupported, permission]);
  
  const markRead = useCallback(() => {
    setHasUnread(false);
  }, []);
  
  return {
    isSupported,
    permission,
    hasUnread,
    requestPermission,
    notify,
    markRead,
  };
}
