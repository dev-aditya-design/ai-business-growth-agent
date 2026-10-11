"""Authenticated AI lead scoring. No service-role key or user data crosses tenants."""
import json
import os
import re
from uuid import UUID

import httpx
from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/ai", tags=["AI scoring"])


class ScoreResult(BaseModel):
    score: int = Field(ge=0, le=100)
    reason: str = Field(min_length=8, max_length=600)
    next_action: str = Field(min_length=5, max_length=300)


def settings():
    url = os.getenv("SUPABASE_URL", "").rstrip("/")
    key = os.getenv("SUPABASE_PUBLISHABLE_KEY", "")
    ai_key = os.getenv("GEMINI_API_KEY", "")
    if not all((url, key, ai_key)):
        raise HTTPException(503, "AI scoring is not configured")
    if not re.fullmatch(r"https://[a-z0-9-]+\.supabase\.co", url):
        raise HTTPException(503, "Invalid database configuration")
    return url, key, ai_key


async def authenticated_user(client, url, key, token):
    headers = {"apikey": key, "Authorization": f"Bearer {token}"}
    try:
        response = await client.get(f"{url}/auth/v1/user", headers=headers)
    except httpx.HTTPError:
        raise HTTPException(502, "Authentication service unavailable")
    if response.status_code != 200:
        raise HTTPException(401, "Invalid or expired session")
    user_id = response.json().get("id")
    try:
        return str(UUID(user_id)), headers
    except (TypeError, ValueError):
        raise HTTPException(401, "Invalid user session")


async def score_with_gemini(client, ai_key, lead):
    model = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
    if not re.fullmatch(r"gemini-[a-zA-Z0-9.-]+", model):
        raise HTTPException(503, "Invalid AI model configuration")
    prompt = (
        "Assess this inbound business lead for a business growth SaaS. "
        "Use only supplied evidence; do not infer personal traits. "
        "No personal or sensitive profiling. "
        "Return a JSON object with score (integer 0-100), reason (8-600 chars), "
        "next_action (5-300 chars). Do not promise conversion. "
        "An unknown lead should receive a conservative score.\n"
        + json.dumps({"company": lead["company"], "source": lead["source"],
                      "estimated_value": str(lead["estimated_value"]),
                      "status": lead["status"]})
    )
    try:
        response = await client.post(
            f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
            headers={"x-goog-api-key": ai_key},
            json={"contents": [{"parts": [{"text": prompt}]}],
                  "generationConfig": {"responseMimeType": "application/json", "temperature": 0.2}},
            timeout=25,
        )
        response.raise_for_status()
        raw = response.json()["candidates"][0]["content"]["parts"][0]["text"]
        return ScoreResult.model_validate_json(raw)
    except (httpx.HTTPError, KeyError, IndexError, ValueError):
        raise HTTPException(502, "AI scoring service failed; lead unchanged")


@router.post("/leads/{lead_id}/score", response_model=ScoreResult)
async def score_lead(lead_id: UUID, authorization: str | None = Header(default=None)):
    if not authorization or not re.fullmatch(r"Bearer [A-Za-z0-9_.-]+", authorization):
        raise HTTPException(401, "Sign in required")
    url, key, ai_key = settings()
    token = authorization.split(" ", 1)[1]
    async with httpx.AsyncClient(timeout=15) as client:
        user_id, headers = await authenticated_user(client, url, key, token)
        try:
            read = await client.get(
                f"{url}/rest/v1/leads",
                headers=headers,
                params={"id": f"eq.{lead_id}", "user_id": f"eq.{user_id}",
                        "select": "id,company,source,estimated_value,status"},
            )
            read.raise_for_status()
        except httpx.HTTPError:
            raise HTTPException(502, "Lead lookup failed")
        records = read.json()
        if not records:
            raise HTTPException(404, "Lead not found")
        result = await score_with_gemini(client, ai_key, records[0])
        try:
            update = await client.patch(
                f"{url}/rest/v1/leads",
                headers={**headers, "Prefer": "return=representation", "Content-Type": "application/json"},
                params={"id": f"eq.{lead_id}", "user_id": f"eq.{user_id}", "select": "id"},
                json={"score": result.score, "ai_reason": result.reason,
                      "ai_next_action": result.next_action},
            )
            update.raise_for_status()
        except httpx.HTTPError:
            raise HTTPException(502, "Failed to save score")
        if not update.json():
            raise HTTPException(404, "Lead not found or access denied")
        return result
