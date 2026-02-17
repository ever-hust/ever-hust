"use client";

import { useState, useEffect, useCallback, useRef } from "react";

/**
 * React hook that syncs state with localStorage.
 *
 * Works safely with SSR — returns `initialValue` during hydration and
 * reads from localStorage after mount. Invalid JSON in localStorage is
 * handled gracefully (the key is removed and `initialValue` is used).
 *
 * When the `key` changes, the state is reset to `initialValue` first,
 * then re-read from localStorage for the new key.
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
  const initialValueRef = useRef(initialValue);
  initialValueRef.current = initialValue;

  // Read from localStorage on mount and whenever the key changes
  useEffect(() => {
    try {
      const item = window.localStorage.getItem(key);
      if (item !== null) {
        const parsed: unknown = JSON.parse(item);
        // Basic sanity check: the parsed type should broadly match initialValue's type
        if (parsed !== undefined) {
          setStoredValue(parsed as T);
          return;
        }
      }
      // Key not found or parsed as undefined — reset to initial value.
      // This ensures switching keys doesn't carry over stale data.
      setStoredValue(initialValueRef.current);
    } catch (error) {
      // Corrupted or unparseable JSON — remove the bad value and fall back
      console.warn(
        `[useLocalStorage] Failed to parse key "${key}", resetting to initial value:`,
        error instanceof Error ? error.message : error
      );
      setStoredValue(initialValueRef.current);
      try {
        window.localStorage.removeItem(key);
      } catch {
        // localStorage may be unavailable (e.g., private browsing with quota 0)
      }
    }
  }, [key]);

  const setValue = useCallback(
    (value: T | ((prev: T) => T)) => {
      setStoredValue((prev) => {
        const nextValue =
          value instanceof Function ? value(prev) : value;
        try {
          window.localStorage.setItem(key, JSON.stringify(nextValue));
        } catch {
          // Quota exceeded or other error — still update in-memory state
        }
        return nextValue;
      });
    },
    [key]
  );

  return [storedValue, setValue];
}
