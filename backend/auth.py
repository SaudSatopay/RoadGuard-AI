"""
Authentication for RoadGuard AI.
JWT-based auth with role-based access (government vs citizen).
"""

import os
import jwt
import time
import secrets
from fastapi import HTTPException, Request

# JWT signing secret. Provide JWT_SECRET_KEY via environment in any real
# deployment. If unset, a random per-process secret is generated so that no
# fixed secret is ever committed to source control (tokens reset on restart).
SECRET_KEY = os.environ.get("JWT_SECRET_KEY") or secrets.token_urlsafe(32)
ALGORITHM = "HS256"
TOKEN_EXPIRY = 86400  # 24 hours

# Hardcoded users for hackathon (in production: database)
USERS = {
    "admin": {"password": "admin123", "role": "government", "name": "Inspector Kumar", "department": "PWD Mumbai"},
    "inspector": {"password": "inspect123", "role": "government", "name": "Officer Sharma", "department": "Municipal Corp"},
    "engineer": {"password": "eng123", "role": "government", "name": "Er. Patel", "department": "NHAI"},
    # Demo citizen account — password-protected citizen profile for presentation
    "saud": {"password": "123", "role": "citizen", "name": "Saud Vinchu", "department": ""},
}


def create_token(username: str, role: str, name: str) -> str:
    payload = {
        "sub": username,
        "role": role,
        "name": name,
        "iat": int(time.time()),
        "exp": int(time.time()) + TOKEN_EXPIRY,
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def verify_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Invalid token")


def get_current_user(request: Request) -> dict:
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(401, "Missing authorization header")
    token = auth.split(" ")[1]
    return verify_token(token)


def require_government(request: Request) -> dict:
    user = get_current_user(request)
    if user.get("role") != "government":
        raise HTTPException(403, "Government access required")
    return user


def login(username: str, password: str) -> dict:
    user = USERS.get(username)
    if not user or user["password"] != password:
        return None
    token = create_token(username, user["role"], user["name"])
    return {
        "token": token,
        "role": user["role"],
        "name": user["name"],
        "department": user.get("department", ""),
        "username": username,
    }


def register_citizen(name: str) -> dict:
    """Citizens don't need passwords — just register with a name."""
    token = create_token(f"citizen_{int(time.time())}", "citizen", name)
    return {
        "token": token,
        "role": "citizen",
        "name": name,
        "username": f"citizen_{int(time.time())}",
    }
