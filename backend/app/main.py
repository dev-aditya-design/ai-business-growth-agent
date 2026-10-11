from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .scoring import router as scoring_router
import os

app = FastAPI(title="AI Business Growth Agent API", version="0.2.0")
allowed_origins = [origin.strip() for origin in os.getenv("FRONTEND_ORIGINS", "").split(",") if origin.strip()]
app.add_middleware(CORSMiddleware, allow_origins=allowed_origins, allow_methods=["GET", "POST"], allow_headers=["Authorization", "Content-Type"])
app.include_router(scoring_router)

@app.get("/health")
def health():
    return {"status": "ok"}
