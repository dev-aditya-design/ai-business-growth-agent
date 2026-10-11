import pytest
import httpx
from fastapi.testclient import TestClient
from app.main import app
from app import scoring

client = TestClient(app)
LEAD = "00000000-0000-4000-8000-000000000001"

@pytest.fixture(autouse=True)
def config(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_PUBLISHABLE_KEY", "test-public-key")
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")

def test_invalid_token_does_not_read_lead(monkeypatch):
    async def fake(request):
        if request.url.path == "/auth/v1/user":
            return httpx.Response(401, json={"message":"unauthorized"})
        raise AssertionError("Lead query must not happen")
    transport = httpx.MockTransport(fake)
    real = httpx.AsyncClient
    monkeypatch.setattr(scoring.httpx, "AsyncClient", lambda **kw: real(transport=transport))
    result = client.post(f"/api/ai/leads/{LEAD}/score", headers={"Authorization":"Bearer invalid-token"})
    assert result.status_code == 401

def test_cross_tenant_lead_not_found(monkeypatch):
    calls = []
    async def fake(request):
        calls.append(request)
        if request.url.path == "/auth/v1/user":
            return httpx.Response(200, json={"id":"00000000-0000-4000-8000-000000000002"})
        if request.method == "GET" and request.url.path == "/rest/v1/leads":
            assert request.url.params["user_id"] == "eq.00000000-0000-4000-8000-000000000002"
            return httpx.Response(200, json=[])
        raise AssertionError("Must not call AI or update another user's lead")
    transport = httpx.MockTransport(fake)
    real = httpx.AsyncClient
    monkeypatch.setattr(scoring.httpx, "AsyncClient", lambda **kw: real(transport=transport))
    result = client.post(f"/api/ai/leads/{LEAD}/score", headers={"Authorization":"Bearer valid-token"})
    assert result.status_code == 404
    assert len(calls) == 2
