// Where the citizen app lives. RoadGuard.bat serves it on port 5175 next to the console (5173).
export function citizenAppUrl(path = "") {
  const override = import.meta.env.VITE_CITIZEN_URL;
  if (override) return `${override.replace(/\/$/, "")}${path}`;
  if (typeof window === "undefined") return `http://localhost:5175${path}`;
  const { protocol, hostname } = window.location;
  return `${protocol}//${hostname}:5175${path}`;
}

export const REPO_URL = "https://github.com/SaudSatopay/CrackWatch-NirmanHackathon";
