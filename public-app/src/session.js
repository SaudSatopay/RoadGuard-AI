// Citizen session, upvotes and an unsent report draft, kept on the phone (memory fallback when storage is blocked).
import { useSyncExternalStore } from "react";

const KEY = "roadguard_citizen";
const VOTES = "roadguard_votes";
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
  return () => listeners.delete(fn);
}

let raw;
let parsed = null;
function getCitizen() {
  const r = read(KEY);
  if (r !== raw) {
    raw = r;
    try {
      parsed = r ? JSON.parse(r) : null;
    } catch {
      parsed = null;
    }
  }
  return parsed;
}

export function useCitizen() {
  return useSyncExternalStore(subscribe, getCitizen, () => null);
}

export function setCitizen(user) {
  write(KEY, user ? JSON.stringify(user) : null);
}

export function hasVoted(id) {
  try {
    return JSON.parse(read(VOTES) || "[]").includes(id);
  } catch {
    return false;
  }
}

export function rememberVote(id) {
  let list = [];
  try {
    list = JSON.parse(read(VOTES) || "[]");
  } catch {
    list = [];
  }
  if (!list.includes(id)) write(VOTES, JSON.stringify([...list, id].slice(-500)));
}
