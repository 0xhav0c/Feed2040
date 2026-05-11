"use client";
import { useEffect, useCallback } from "react";

type ShortcutMap = Record<string, () => void>;

export function useKeyboardShortcuts(shortcuts: ShortcutMap) {
  const handler = useCallback(
    (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        if (e.key === "Escape") {
          (e.target as HTMLElement).blur();
        }
        return;
      }
      // For Shift+letter combos, use uppercase key (e.g. "A" for Shift+A)
      // For regular keys, lowercase them
      let key: string;
      if (e.key === "Escape") {
        key = "Escape";
      } else if (e.key === "?") {
        key = "?";
      } else if (e.shiftKey && e.key.length === 1 && e.key >= "A" && e.key <= "Z") {
        key = e.key; // Keep uppercase for Shift+letter
      } else {
        key = e.key.toLowerCase();
      }
      if (shortcuts[key]) {
        e.preventDefault();
        shortcuts[key]();
      }
    },
    [shortcuts]
  );

  useEffect(() => {
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handler]);
}
