import { useState } from "react";

const REDUCE = "(prefers-reduced-motion: reduce)";

export function prefersReducedMotion() {
  return typeof window !== "undefined" && Boolean(window.matchMedia?.(REDUCE).matches);
}

/**
 * Entrance animations only when they can actually play: the visitor hasn't asked for reduced motion and the
 * page is visible at mount. A page opened in a background tab renders its final state, so nothing meant
 * to be read ever waits on an animation frame.
 */
export function useEntrance() {
  const [ok] = useState(
    () => typeof document !== "undefined" && document.visibilityState === "visible" && !prefersReducedMotion(),
  );
  return ok;
}

export function useReducedMotionPreference() {
  const [reduce] = useState(prefersReducedMotion);
  return reduce;
}
