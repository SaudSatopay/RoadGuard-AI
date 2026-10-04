// The one WebGL moment on the landing page: the RoadGuard ring rendered as liquid aluminium,
// the metal road signs are made of. Lazy-mounted when scrolled into view; static ring otherwise.
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useReducedMotionPreference } from "@shared/lib/motion.js";

const LiquidMetal = lazy(() => import("@paper-design/shaders-react").then((m) => ({ default: m.LiquidMetal })));

function webglAvailable() {
  try {
    const c = document.createElement("canvas");
    const gl = c.getContext("webgl2") || c.getContext("webgl");
    gl?.getExtension("WEBGL_lose_context")?.loseContext(); // release the probe context straight away
    return Boolean(gl);
  } catch {
    return false;
  }
}

function shaderColor(name, fallback) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

function Poster({ size }) {
  return (
    <svg width={size} height={size} viewBox="0 0 200 200" aria-hidden="true" className="absolute inset-0 h-full w-full">
      <defs>
        <linearGradient id="alu" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--color-chalk)" />
          <stop offset="0.45" stopColor="var(--color-chalk-2)" />
          <stop offset="0.7" stopColor="var(--color-chalk)" />
          <stop offset="1" stopColor="var(--color-asphalt-line)" />
        </linearGradient>
      </defs>
      <path d="M44 104c-3-33 23-58 59-57 37 1 61 24 58 56-3 31-31 49-65 48-33-1-52-17-55-41 0-14 7-26 18-34"
        fill="none" stroke="url(#alu)" strokeWidth="21" strokeLinecap="round" />
      <path d="M150 38l13 21" stroke="url(#alu)" strokeWidth="16" strokeLinecap="round" />
    </svg>
  );
}

export default function MetalSign({ size = 320 }) {
  const ref = useRef(null);
  const reduce = useReducedMotionPreference();
  const [visible, setVisible] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [canGl] = useState(() => typeof document !== "undefined" && webglAvailable());

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return undefined;
    // Mount the shader the first time it comes near the viewport, then keep it: off-screen it only pauses.
    const io = new IntersectionObserver(([entry]) => {
      setVisible(entry.isIntersecting);
      if (entry.isIntersecting) setMounted(true);
    }, { rootMargin: "120px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} className="relative" style={{ width: size, height: size, maxWidth: "100%" }}>
      <Poster size={size} />
      {mounted && canGl && (
        <Suspense fallback={null}>
          <LiquidMetal
            className="absolute inset-0"
            width="100%"
            height="100%"
            image="/brand/ring-mask.svg"
            shape="none"
            colorBack={shaderColor("--shader-back", "transparent")}
            colorTint={shaderColor("--shader-tint", "white")}
            repetition={2.2}
            softness={0.12}
            shiftRed={0.25}
            shiftBlue={0.25}
            distortion={0.08}
            contour={0.45}
            angle={70}
            speed={reduce || !visible ? 0 : 0.55}
            scale={0.9}
            fit="contain"
            maxPixelCount={size * size * 2.25}
          />
        </Suspense>
      )}
    </div>
  );
}
