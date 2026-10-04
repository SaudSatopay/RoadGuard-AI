"""Demo authentication endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Form, HTTPException, Request

from auth import login, register_citizen, verify_token

router = APIRouter(tags=["auth"])


@router.post("/auth/login")
async def auth_login(username: str = Form(...), password: str = Form(...)):
    result = login(username, password)
    if not result:
        raise HTTPException(401, "Wrong username or password.")
    return result


@router.post("/auth/register")
async def auth_register(name: str = Form(...)):
    if not name.strip():
        raise HTTPException(400, "Enter your name to continue.")
    return register_citizen(name.strip())


@router.get("/auth/me")
async def auth_me(request: Request):
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        raise HTTPException(401, "Not signed in.")
    payload = verify_token(header.split(" ", 1)[1])
    return {"username": payload["sub"], "role": payload["role"], "name": payload["name"]}
