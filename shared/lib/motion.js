import { useState } from "react";
import { useReducedMotion } from "framer-motion";

/**
 * Entrance animations only when they can actually play: the visitor hasn't asked for reduced motion and the
 * page is visible at mount. A page opened in a background tab renders its final state, so nothing meant
 * to be read ever waits on an animation frame.
 */
export function useEntrance() {
  const reduce = useReducedMotion();
  const [visible] = useState(() => typeof document === "undefined" || document.visibilityState === "visible");
  return visible && !reduce;
}

export const EASE_OUT = [0.2, 0.7, 0.2, 1];
