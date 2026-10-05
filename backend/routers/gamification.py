"""Citizen gamification endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Form, HTTPException

import gamification as g
from store import store

router = APIRouter(tags=["gamification"])


@router.get("/gamification/leaderboard")
async def leaderboard():
    return {"leaderboard": g.get_leaderboard(20)}


@router.get("/gamification/profile/{user_id}")
async def profile(user_id: str):
    return g.get_user_profile_full(user_id)


@router.get("/gamification/challenges/{user_id}")
async def challenges(user_id: str):
    return {"challenges": g.get_daily_challenges(user_id)}


@router.post("/gamification/verify")
async def verify(report_id: str = Form(...), voter_id: str = Form(...), vote: str = Form(...)):
    if vote not in ("valid", "invalid"):
        raise HTTPException(400, "vote must be 'valid' or 'invalid'.")
    return g.community_vote(report_id, voter_id, vote)


@router.get("/gamification/ai-challenge")
async def ai_challenge():
    return g.ai_challenge_round()


@router.post("/gamification/ai-challenge/answer")
async def ai_challenge_answer(user_id: str = Form(...), answer: str = Form(...), correct_answer: str = Form(...)):
    return g.check_ai_challenge(user_id, answer, correct_answer)


@router.get("/gamification/fix-streaks")
async def fix_streaks():
    store.refresh()
    return {"streaks": g.get_authority_fix_streaks(store.reports)}


@router.post("/gamification/seed-demo")
async def seed_demo():
    store.refresh()
    n = g.seed_profiles_from_reports(store.reports)
    return {"seeded": n, "message": "Leaderboard rebuilt from the reports on the ledger."}


@router.get("/gamification/achievements")
async def achievements():
    return {"achievements": [{"id": k, **v} for k, v in g.ACHIEVEMENTS.items()]}
