"""
Complaint letters for a hazard, addressed to the responsible authority.

Retrieval-augmented and template first:
1. Retrieve grounding snippets from `knowledge/*.json` with TF-IDF over
   title + text + tags, using a query built from the report.
2. Fill a fixed template with the report's own evidence.
3. Optionally, when ANTHROPIC_API_KEY is set and mode is not "template",
   ask Claude to write the letter from the same facts and snippets; any
   failure or refusal falls back to the template.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from functools import lru_cache

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

import config
from config import log
from hazards import parse_ts
from severity import LEVELS, fix_target_days
from wards import office_for

CLAUDE_MODEL = "claude-opus-5-5"
TOP_K = 4

CHANNELS = {
    "MCGM": "MCGM ward office, MCGM's online complaint portal, or the 24x7 civic helpline 1916",
    "NMMC": "NMMC ward office or NMMC's online grievance portal",
    "PMC": "Panvel Municipal Corporation ward office or its online grievance portal",
    "TMC": "Thane Municipal Corporation ward office or its online grievance portal",
    "CIDCO": "CIDCO's Navi Mumbai office",
    "MSRDC": "MSRDC office for the expressway (or its operator's helpline)",
}

ESCALATION_TEXT = {
    "kb-rti-30-days": "If there is no reply, file an RTI application asking what action was taken; "
                      "under section 7(1) of the RTI Act, 2005 the reply is due within 30 days.",
    "kb-aaple-sarkar": "Raise the complaint on the Government of Maharashtra's Aaple Sarkar grievance portal.",
    "kb-rts-maharashtra": "If road repair is a notified service of this authority, appeal to the designated "
                          "officer under the Maharashtra Right to Public Services Act, 2015.",
    "kb-cpgrams": "For a central government body such as NHAI, file a grievance on CPGRAMS (pgportal.gov.in).",
    "kb-mcgm-wards": "Escalate to the Assistant Commissioner of the ward.",
}


# ------------------------------------------------------------------ retrieval

@lru_cache(maxsize=1)
def load_knowledge() -> list[dict]:
    docs = []
    for path in sorted(config.KNOWLEDGE_DIR.glob("*.json")):
        docs.extend(json.loads(path.read_text(encoding="utf-8")))
    return docs


@lru_cache(maxsize=1)
def _index():
    docs = load_knowledge()
    corpus = [f"{d['title']} {d['text']} {' '.join(d.get('tags', []))}" for d in docs]
    vec = TfidfVectorizer(lowercase=True, ngram_range=(1, 2), sublinear_tf=True)
    matrix = vec.fit_transform(corpus)
    return docs, vec, matrix


def retrieve(query: str, k: int = TOP_K) -> list[tuple[dict, float]]:
    docs, vec, matrix = _index()
    scores = cosine_similarity(vec.transform([query]), matrix).ravel()
    order = scores.argsort()[::-1]
    return [(docs[i], float(scores[i])) for i in order[:k] if scores[i] > 0]


def _ranked_all(query: str) -> list[tuple[dict, float]]:
    docs, vec, matrix = _index()
    scores = cosine_similarity(vec.transform([query]), matrix).ravel()
    return [(docs[i], float(scores[i])) for i in scores.argsort()[::-1]]


def build_query(report: dict, authority: dict, top: dict | None) -> str:
    label = (top or {}).get("label", "road defect")
    category = (top or {}).get("category", "")
    ward = report.get("ward") or {}
    return " ".join(filter(None, [
        label, category, "road complaint pothole repair",
        authority.get("short", ""), authority.get("name", ""),
        ward.get("name", ""), "ward office", report.get("road_class", ""),
        report.get("status", "submitted").replace("_", " "),
        "escalation: no reply within 30 days, ask what action was taken",
    ]))


# ------------------------------------------------------------------ facts

def _top_detection(report: dict) -> dict | None:
    """The most urgent detection (priority rank 1), which the letter is about."""
    dets = report.get("detections") or []
    if not dets:
        return None
    return min(dets, key=lambda d: (d.get("priority_rank") or 999, -d.get("severity", 0)))


def _days_open(first_ts: str, status: str, history: list[dict], now: datetime) -> int:
    start = parse_ts(first_ts)
    end = now
    if status == "fixed":
        fixed = [parse_ts(h["time"]) for h in history if h.get("status") == "fixed"]
        if fixed:
            end = max(fixed)
    return max(0, (end - start).days)


def _extent_sentence(top: dict) -> str:
    geo = top.get("geometry")
    if geo and geo.get("length_m"):
        return (f"The crack is about {geo['length_m']} m long (estimate that assumes the photo spans "
                f"one 3.6 m lane), with a mean width of about {geo['mean_width_px']} px in the photo.")
    return ""


def _factor_summary(top: dict | None) -> list[str]:
    """'defect type (35.0 points: ...)' phrases for the three largest severity factors."""
    factors = sorted((top or {}).get("severity_factors") or [], key=lambda f: f["points"], reverse=True)[:3]
    return [f"{f['label'].lower()} ({f['points']:.1f} points: {f['detail'][0].lower()}{f['detail'][1:]})"
            for f in factors]


def collect_facts(report: dict, hazard: dict | None, base_url: str, now: datetime) -> dict:
    top = _top_detection(report)
    loc = report.get("location") or {}
    ward = report.get("ward") or {}
    authority = report.get("authority") or {}
    first_ts = (hazard or {}).get("first_reported") or report["timestamp"]
    merged = (hazard or {}).get("report_count", 1)
    photo = report.get("image_url") or ""
    if photo.startswith("/"):
        photo = base_url.rstrip("/") + photo
    summary = report.get("summary") or {}
    level = (top or {}).get("severity_level") or summary.get("worst_level") or "S1"
    return {
        "report_id": report["id"],
        "hazard_id": (hazard or {}).get("hazard_id"),
        "defect": (top or {}).get("label", "Road defect"),
        "code": (top or {}).get("code"),
        "confidence_pct": round((top or {}).get("confidence", 0) * 100),
        "severity": (top or {}).get("severity", summary.get("max_severity", 0)),
        "severity_level": level,
        "severity_name": LEVELS[level]["name"],
        "top_factors": _factor_summary(top),
        "extent": _extent_sentence(top) if top else "",
        "defect_count": summary.get("total", len(report.get("detections") or [])),
        "cost_estimated": int(summary.get("total_cost", 0)),
        "cost_if_ignored": int(summary.get("total_cost_if_ignored", 0)),
        "repair_method": ((top or {}).get("cost") or {}).get("repair_method"),
        "location_name": loc.get("name") or "the reported location",
        "latitude": loc.get("latitude"),
        "longitude": loc.get("longitude"),
        "ward_code": ward.get("code"),
        "ward_name": ward.get("name"),
        "authority_short": authority.get("short"),
        "authority_name": authority.get("name"),
        "road_class": report.get("road_class"),
        "first_reported": first_ts,
        "days_open": _days_open(first_ts, report.get("status", "submitted"), report.get("status_history") or [], now),
        "merged_reports": merged,
        "total_upvotes": (hazard or {}).get("total_upvotes", report.get("upvotes", 0)),
        "status": report.get("status", "submitted"),
        "photo_url": photo,
        "reporter": report.get("reporter") or "a resident",
        "fix_target_days": fix_target_days(level),
    }


def _inr(v: int) -> str:
    return f"₹{v:,}"


def _gps(f: dict) -> str:
    if f["latitude"] is None or f["longitude"] is None:
        return "not recorded"
    return f"{float(f['latitude']):.5f}, {float(f['longitude']):.5f}"


def evidence_list(f: dict) -> list[dict]:
    return [
        {"label": "RoadGuard report", "value": f["report_id"]},
        {"label": "Hazard", "value": f["hazard_id"] or "—"},
        {"label": "GPS", "value": _gps(f)},
        {"label": "First reported", "value": parse_ts(f["first_reported"]).isoformat(timespec="minutes")},
        {"label": "Photo", "value": f["photo_url"] or "—"},
        {"label": "Citizen reports merged", "value": str(f["merged_reports"])},
        {"label": "Days open", "value": str(f["days_open"])},
        {"label": "Severity", "value": f"{f['severity_level']} {f['severity_name']} ({f['severity']}/100)"},
        {"label": "Estimated repair cost", "value": _inr(f["cost_estimated"]) + " (indicative)"},
    ]


# ------------------------------------------------------------------ template

def template_letter(f: dict, office: str, escalation_line: str, now: datetime) -> tuple[str, str]:
    where = f["location_name"]
    ward_part = f" ({f['ward_name']} ward, approx.)" if f.get("ward_name") and f.get("ward_code") != "—" else ""
    subject = f"{f['defect']} at {where}, RoadGuard report {f['report_id']}"
    first_date = parse_ts(f["first_reported"]).strftime("%d %B %Y")
    factors = "; ".join(f["top_factors"])
    lines = [
        now.strftime("%d %B %Y"),
        "",
        "To,",
        office,
        f["authority_name"] or "",
        "",
        f"Subject: {subject}",
        "",
        "Dear Sir or Madam,",
        "",
        f"I am writing to report a {f['defect'].lower()} at {where}{ward_part}, GPS {_gps(f)}. "
        f"It was first reported on RoadGuard AI on {first_date} and has been open for {f['days_open']} days.",
        "",
        "What was found",
        f"RoadGuard's road-damage detector identified a {f['defect'].lower()} in the attached photograph with "
        f"{f['confidence_pct']}% confidence, rated {f['severity_level']} ({f['severity_name']}), severity "
        f"{f['severity']}/100."
        + (f" The largest severity factors were {factors}." if factors else "")
        + (f" {f['extent']}" if f["extent"] else "")
        + (f" The photo shows {f['defect_count']} defects in total." if f["defect_count"] > 1 else ""),
        f"The indicative repair cost is {_inr(f['cost_estimated'])}"
        + (f" ({f['repair_method'].lower()})" if f.get("repair_method") else "")
        + (f"; if it is left untreated the estimate rises to about {_inr(f['cost_if_ignored'])}."
           if f["cost_if_ignored"] else "."),
    ]
    if f["merged_reports"] > 1:
        lines += ["", f"{f['merged_reports']} citizen reports of this spot have been merged into hazard "
                      f"{f['hazard_id']}, with {f['total_upvotes']} upvotes in total."]
    lines += ["", "Evidence"]
    lines += [f"- {e['label']}: {e['value']}" for e in evidence_list(f)]
    request = "Please inspect the location and repair the defect."
    if f.get("code") == "D40":
        request += " Until it is repaired, please barricade or mark it so that two-wheelers can see it."
    request += (f" RoadGuard's own target for an {f['severity_level']} defect is a repair within "
                f"{f['fix_target_days']} days; this is a RoadGuard target, not a government commitment. "
                f"Please let me know what action is taken on this complaint.")
    lines += ["", "Request", request]
    if escalation_line:
        lines += ["", "If there is no response", escalation_line]
    lines += ["", "Yours faithfully,", f"Submitted through RoadGuard AI on behalf of {f['reporter']}"]
    return subject, "\n".join(lines)


# ------------------------------------------------------------------ Claude

SYSTEM_PROMPT = (
    "You draft formal complaint letters from Indian citizens to the authority responsible for a damaged road. "
    "Write in plain, formal, concise English. Use only the facts and reference snippets provided: do not invent "
    "numbers, dates, names, laws, sections, deadlines or phone numbers. RoadGuard targets must be described as "
    "RoadGuard targets, never as government commitments. Do not add markdown formatting."
)


def _claude_letter(facts: dict, office: str, snippets: list[dict], escalation_line: str) -> tuple[str, str]:
    import anthropic

    client = anthropic.Anthropic(timeout=45.0, max_retries=1)
    payload = {
        "addressee": {"office": office, "authority": facts["authority_name"]},
        "facts": facts,
        "escalation_line": escalation_line,
        "reference_snippets": [{"id": s["id"], "source": s["source"], "text": s["text"]} for s in snippets],
    }
    user = (
        "Write the complaint letter from these facts and reference snippets.\n\n"
        f"{json.dumps(payload, ensure_ascii=False, indent=1)}\n\n"
        "Output format:\n"
        "Line 1: 'Subject: <subject>' (mention the defect, the location and the RoadGuard report id).\n"
        "Then a blank line, then the letter body: date, addressee block, salutation, what was found "
        "(detector confidence, severity level and its main factors, extent, indicative cost), an evidence list "
        "(report id, GPS to 5 decimals, first-reported timestamp, photo URL, merged citizen reports, days open), "
        "the request, one escalation sentence based on the escalation_line, and the sign-off "
        f"'Submitted through RoadGuard AI on behalf of {facts['reporter']}'. Under 350 words."
    )
    response = client.beta.messages.create(
        model=CLAUDE_MODEL,
        max_tokens=4000,
        betas=["server-side-fallback-2026-07-01"],
        extra_body={"fallbacks": "default", "output_config": {"effort": "low"}},
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user}],
    )
    if response.stop_reason == "refusal":
        raise RuntimeError("the model declined the request")
    text = "".join(getattr(b, "text", "") for b in response.content if getattr(b, "type", "") == "text").strip()
    if not text:
        raise RuntimeError("no text came back")
    first, _, rest = text.partition("\n")
    if first.lower().startswith("subject:"):
        return first.split(":", 1)[1].strip(), rest.strip()
    return "", text


# ------------------------------------------------------------------ entry point

def generate_complaint(report: dict, hazard: dict | None, base_url: str = "",
                       mode: str = "auto", now: datetime | None = None) -> dict:
    now = now or datetime.now(timezone.utc)
    facts = collect_facts(report, hazard, base_url, now)
    ward = report.get("ward") or {}
    authority = report.get("authority") or {"short": None, "name": None}
    office = office_for(ward, authority)
    top = _top_detection(report)

    ranked = _ranked_all(build_query(report, authority, top))
    grounding = [d for d, s in ranked[:TOP_K] if s > 0]
    escalation_doc = next((d for d, _ in ranked if d["id"] in ESCALATION_TEXT
                           and d["id"] not in ("kb-mcgm-wards", "kb-cpgrams")), None)
    if escalation_doc and escalation_doc not in grounding:
        grounding.append(escalation_doc)
    targets = next(d for d in load_knowledge() if d["id"] == "kb-roadguard-targets")
    if targets not in grounding:
        grounding.append(targets)
    escalation_line = ESCALATION_TEXT.get(escalation_doc["id"], "") if escalation_doc else ""

    escalation = [ESCALATION_TEXT[d["id"]] for d, _ in ranked if d["id"] in ESCALATION_TEXT]
    if authority.get("short") != "MCGM":
        escalation = [e for e in escalation if e != ESCALATION_TEXT["kb-mcgm-wards"]]
    if authority.get("short") != "NHAI":
        escalation = [e for e in escalation if e != ESCALATION_TEXT["kb-cpgrams"]]

    subject, body = template_letter(facts, office, escalation_line, now)
    generated_by = "template"
    note = None
    if mode != "template" and config.ANTHROPIC_API_KEY:
        try:
            import anthropic
            try:
                c_subject, c_body = _claude_letter(facts, office, grounding, escalation_line)
                subject, body = (c_subject or subject), c_body
                generated_by = CLAUDE_MODEL
            except anthropic.APIConnectionError as e:
                note = f"Claude could not be reached ({type(e).__name__}); template letter used."
            except anthropic.RateLimitError:
                note = "Claude is rate limited right now; template letter used."
            except anthropic.APIStatusError as e:
                note = f"Claude returned HTTP {e.status_code}; template letter used."
        except RuntimeError as e:
            note = f"Claude letter not used ({e}); template letter used."
        except ImportError:
            note = "The anthropic package is not installed; template letter used."
        except Exception as e:  # never let the optional path break the endpoint
            note = f"Claude letter failed ({type(e).__name__}); template letter used."
        if note:
            log(note)

    result = {
        "report_id": report["id"],
        "hazard_id": facts["hazard_id"],
        "generated_by": generated_by,
        "to": {
            "authority": authority.get("name"),
            "office": office,
            "channel": CHANNELS.get(authority.get("short"), "The ward office or road authority for this location"),
            "escalation": escalation,
        },
        "subject": subject,
        "body": body,
        "evidence": evidence_list(facts),
        "grounding": [
            {"id": d["id"], "title": d["title"], "source": d["source"], "snippet": d["text"]}
            for d in grounding
        ],
        "created_at": now.isoformat(),
    }
    if note:
        result["note"] = note
    return result
