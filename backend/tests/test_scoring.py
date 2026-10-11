from fastapi.testclient import TestClient
from app.main import app
from app.scoring import ScoreResult

client = TestClient(app)

def test_requires_login():
    response = client.post("/api/ai/leads/00000000-0000-4000-8000-000000000001/score")
    assert response.status_code == 401

def test_invalid_lead_id():
    response = client.post("/api/ai/leads/not-a-uuid/score")
    assert response.status_code == 422

def test_scoring_output_bounds():
    assert ScoreResult(score=75, reason="Strong business match", next_action="Schedule discovery call").score == 75

def test_score_out_of_range():
    from pydantic import ValidationError
    try:
        ScoreResult(score=101, reason="Strong business match", next_action="Schedule discovery call")
    except ValidationError:
        return
    raise AssertionError("Score above 100 must be rejected")
