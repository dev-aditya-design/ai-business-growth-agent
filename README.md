# GrowthPilot AI — Business Growth Workspace

A portfolio SaaS MVP for private lead management, AI lead qualification, human-reviewed follow-up drafts, and data-backed analytics.

## Features
- Supabase email/password authentication and per-user leads (RLS required).
- Create, edit, delete, search and filter leads.
- Gemini-powered lead scoring and insights, stored on the lead.
- AI follow-up email drafts with editable subject/message and copy action. **No messages are sent automatically.**
- Overview metrics, lead activity, status distribution, and AI scoring analytics.
- Responsive React/Vite dashboard and FastAPI backend.

## Project layout
- `frontend/`: React, Vite, Tailwind and Supabase client.
- `backend/`: FastAPI scoring and follow-up endpoints.
- `backend/tests/`: API, authentication and tenant-isolation tests.

## Run locally
Frontend: `cd frontend && npm install && npm run dev`.
Backend: `cd backend && pip install -r requirements.txt && uvicorn app.main:app --reload`.
Backend tests: `cd backend && pytest -q`.
Frontend build: `cd frontend && npm run build`.

Copy the corresponding `.env.example` to your local `.env`. **Never commit secrets.**

### Frontend environment
- `VITE_SUPABASE_URL`: Supabase project URL.
- `VITE_SUPABASE_PUBLISHABLE_KEY`: browser-safe publishable key.
- `VITE_API_BASE_URL`: HTTPS backend URL (no trailing slash).

### Backend environment
- `SUPABASE_URL`: Supabase project URL.
- `SUPABASE_PUBLISHABLE_KEY`: publishable key.
- `GEMINI_API_KEY`: **secret**, backend only.
- `GEMINI_MODEL`: available Gemini model (verify API access).
- `FRONTEND_ORIGINS`: comma-separated exact frontend HTTPS origins for CORS.

**Never expose a Gemini key or Supabase service-role key in the frontend.** No service-role key is required by this backend.

## Database
The `public.leads` table needs at least `id` (UUID), `user_id` (UUID), `name`, `company`, `email`, `status`, `source`, `estimated_value`, `score`, `ai_reason`, `ai_next_action`, `created_at`.
Enable Row Level Security (RLS) and policies restricting SELECT/INSERT/UPDATE/DELETE to `auth.uid() = user_id`. Do not launch publicly until these policies are verified.

## Release process
Work on `develop`. GitHub Actions must pass both frontend build and backend tests. Verify preview auth, data isolation, lead CRUD, scoring, follow-up draft and mobile layout. Only then review a PR into `main`. The permanent project URL is `https://growthpilot-ai-preview.vercel.app`; immutable deployment URLs are temporary.

## Scope limitations
This MVP does **not** send WhatsApp messages or emails automatically, import Google Maps contacts, run scheduled campaigns, or guarantee conversion predictions. Any future outreach integration must include consent, provider policy compliance, explicit approvals, rate limits, and audit trails.
