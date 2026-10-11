import httpx
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app import followup

client = TestClient(app)
LEAD = "00000000-0000-4000-8000-000000000001"

@pytest.fixture(autouse=True)
def config(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_PUBLISHABLE_KEY", "test-public-key")
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")

def test_followup_requires_login():
    response = client.post(f"/api/ai/leads/{LEAD}/follow-up")
    assert response.status_code == 401

def test_followup_cross_tenant_denied(monkeypatch):
    calls = []
    async def fake(request):
        calls.append(request)
        if request.url.path == "/auth/v1/user":
            return httpx.Response(200, json={"id":"00000000-0000-4000-8000-000000000002"})
        if request.url.path == "/rest/v1/leads":
            assert request.url.params["user_id"] == "eq.00000000-0000-4000-8000-000000000002"
            return httpx.Response(200, json=[])
        raise AssertionError("AI must not receive another user's lead")
    transport = httpx.MockTransport(fake)
    real = httpx.AsyncClient
    monkeypatch.setattr(followup.httpx, "AsyncClient", lambda **kw: real(transport=transport))
    response = client.post(f"/api/ai/leads/{LEAD}/follow-up", headers={"Authorization":"Bearer valid-token"})
    assert response.status_code == 404
    assert len(calls) == 2

def test_followup_generates_draft_without_sending(monkeypatch):
    calls = []
    async def fake(request):
        calls.append(request)
        if request.url.path == "/auth/v1/user":
            return httpx.Response(200, json={"id":"00000000-0000-4000-8000-000000000002"})
        if request.url.path == "/rest/v1/leads":
            return httpx.Response(200, json=[{"id":LEAD,"name":"Test","company":"Example Co","status":"New","source":"Manual","ai_reason":None,"ai_next_action":None}])
        if request.url.path.endswith(":generateContent"):
            return httpx.Response(200, json={"candidates":[{"content":{"parts":[{"text":'{"subject":"Following up with Example Co","message":"Hello Test, I wanted to check whether there is a convenient time to discuss your business needs. Best, GrowthPilot AI team"}'}]}}]})
        raise AssertionError("Unexpected network call")
    transport = httpx.MockTransport(fake)
    real = httpx.AsyncClient
    monkeypatch.setattr(followup.httpx, "AsyncClient", lambda **kw: real(transport=transport))
    response = client.post(f"/api/ai/leads/{LEAD}/follow-up", headers={"Authorization":"Bearer valid-token"})
    assert response.status_code == 200
    assert response.json()["subject"].startswith("Following up")
    assert len(calls) == 3
    assert all(request.method != "PATCH" for request in calls)
