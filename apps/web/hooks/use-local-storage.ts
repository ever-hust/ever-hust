"use client";

import { useState, useEffect, useCallback } from "react";

/**
 * React hook that syncs state with localStorage.
 *
 * Works safely with SSR — returns `initialValue` during hydration and
 * reads from localStorage after mount.
 *
 * @example
 * const [sidebarCollapsed, setSidebarCollapsed] = useLocalStorage("sidebar-collapsed", false);
 */
export function useLocalStorage<T>(
  key: string,
  initialValue: T
): [T, (value: T | ((prev: T) => T)) => void] {
  // Use initialValue for SSR, then sync from localStorage after mount
  const [storedValue, setStoredValue] = useState<T>(initialValue);
  const [isHydrated, setIsHydrated] = useState(false);

  // Read from localStorage on mount
  useEffect(() => {
    try {
      const item = window.localStorage.getItem(key);
      if (item !== null) {
        setStoredValue(JSON.parse(item) as T);
      }
    } catch {
      // If reading fails, use initial value
    }
    setIsHydrated(true);
  }, [key]);

  const setValue = useCallback(
    (value: T | ((prev: T) => T)) => {
      setStoredValue((prev) => {
        const nextValue =
          value instanceof Function ? value(prev) : value;
        try {
          window.localStorage.setItem(key, JSON.stringify(nextValue));
        } catch {
          // Quota exceeded or other error — still update state
        }
        return nextValue;
      });
    },
    [key]
  );

  return [storedValue, setValue];
}
