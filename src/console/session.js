// Inspector session and theme, persisted in localStorage (falls back to memory when storage is blocked).
import { useSyncExternalStore } from "react";

const USER_KEY = "roadguard_user";
const THEME_KEY = "roadguard_theme";
const listeners = new Set();
const memory = {};

function read(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return memory[key] ?? null;
  }
}

function write(key, value) {
  try {
    if (value == null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    if (value == null) delete memory[key];
    else memory[key] = value;
  }
  listeners.forEach((fn) => fn());
}

function subscribe(fn) {
  listeners.add(fn);
  const onStorage = (e) => (e.key === USER_KEY || e.key === THEME_KEY) && fn();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(fn);
    window.removeEventListener("storage", onStorage);
  };
}

let cachedRaw;
let cachedUser = null;
function getUser() {
  const raw = read(USER_KEY);
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    try {
      cachedUser = raw ? JSON.parse(raw) : null;
    } catch {
      cachedUser = null;
    }
  }
  return cachedUser;
}

export function signIn(user) {
  write(USER_KEY, JSON.stringify(user));
}

export function signOut() {
  write(USER_KEY, null);
}

export function setTheme(theme) {
  write(THEME_KEY, theme);
}

export function useSession() {
  const user = useSyncExternalStore(subscribe, getUser, () => null);
  const theme = useSyncExternalStore(subscribe, () => read(THEME_KEY) || "day", () => "day");
  return { user, theme };
}
