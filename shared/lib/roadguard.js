// Domain vocabulary shared by the console and the citizen app. Mirrors backend/classes.py and severity.py.

export const DEFECTS = {
  D00: { code: "D00", key: "longitudinal_crack", label: "Longitudinal crack", short: "Long. crack" },
  D10: { code: "D10", key: "transverse_crack", label: "Transverse crack", short: "Trans. crack" },
  D20: { code: "D20", key: "alligator_crack", label: "Alligator crack", short: "Alligator" },
  D40: { code: "D40", key: "pothole", label: "Pothole", short: "Pothole" },
};

const BY_KEY = Object.fromEntries(Object.values(DEFECTS).map((d) => [d.key, d]));
const ALIASES = {
  potholes: "D40",
  "longitudinal crack": "D00",
  "transverse crack": "D10",
  "alligator crack": "D20",
};

/** Resolve any backend spelling (code, key or display name) to a defect entry. */
export function defectOf(value) {
  if (!value) return null;
  const raw = String(value).trim();
  if (DEFECTS[raw.toUpperCase()]) return DEFECTS[raw.toUpperCase()];
  const low = raw.toLowerCase();
  if (BY_KEY[low]) return BY_KEY[low];
  if (BY_KEY[low.replace(/\s+/g, "_")]) return BY_KEY[low.replace(/\s+/g, "_")];
  if (ALIASES[low]) return DEFECTS[ALIASES[low]];
  return null;
}

export const LEVELS = {
  S1: { level: "S1", name: "Minor", min: 0, fix_days: 60 },
  S2: { level: "S2", name: "Moderate", min: 40, fix_days: 30 },
  S3: { level: "S3", name: "Severe", min: 55, fix_days: 15 },
  S4: { level: "S4", name: "Critical", min: 70, fix_days: 7 },
};

export function levelOf(score) {
  if (score == null || Number.isNaN(score)) return "S1";
  if (score >= 70) return "S4";
  if (score >= 55) return "S3";
  if (score >= 40) return "S2";
  return "S1";
}

export const STATUSES = {
  submitted: { key: "submitted", label: "Open", step: 0 },
  acknowledged: { key: "acknowledged", label: "Acknowledged", step: 1 },
  in_progress: { key: "in_progress", label: "Crew assigned", step: 2 },
  fixed: { key: "fixed", label: "Fixed", step: 3 },
};

export const STATUS_FLOW = ["submitted", "acknowledged", "in_progress", "fixed"];

export const ROAD_CLASSES = [
  { key: "expressway", label: "Expressway", citizen: "Highway or expressway", weight: 1.0 },
  { key: "arterial", label: "Arterial", citizen: "Main road", weight: 0.8 },
  { key: "collector", label: "Collector", citizen: "Connecting road", weight: 0.6 },
  { key: "local", label: "Local", citizen: "Lane or side street", weight: 0.4 },
];

export const SLA_TARGET_DAYS = { S4: 7, S3: 15, S2: 30, S1: 60 };
