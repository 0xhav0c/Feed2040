"use client";

import { useEffect, useCallback, useSyncExternalStore } from "react";

type Theme = "light" | "dark" | "system";

const STORAGE_KEY = "feed2040-theme";
const CHANGE_EVENT = "feed2040-theme-change";

function getSystemTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function applyTheme(theme: Theme) {
  const resolved = theme === "system" ? getSystemTheme() : theme;
  document.documentElement.classList.toggle("dark", resolved === "dark");
}

// Dark is the default look of the app (design system: AI-Native).
function readTheme(): Theme {
  return (localStorage.getItem(STORAGE_KEY) as Theme | null) || "dark";
}

function subscribe(cb: () => void) {
  window.addEventListener("storage", cb); // other tabs
  window.addEventListener(CHANGE_EVENT, cb); // this tab
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(CHANGE_EVENT, cb);
  };
}

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, readTheme, () => "dark" as Theme);

  // Keep the <html> class in sync, including OS changes while on "system".
  useEffect(() => {
    applyTheme(theme);
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => applyTheme("system");
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);

  const setTheme = useCallback((t: Theme) => {
    localStorage.setItem(STORAGE_KEY, t);
    applyTheme(t);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);

  return { theme, setTheme };
}
