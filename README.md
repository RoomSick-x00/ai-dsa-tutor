# AI DSA Tutor

AI DSA Tutor is a Socratic tutor for Data Structures and Algorithms practice. It uses the Gemini API from a FastAPI backend and streams responses to a Next.js chat interface.

## Current functionality

- Hint Ladder: escalating, frontend-owned hint levels with deflection checks before a user advances.
- Brainstorming: exploratory discussion of possible approaches.
- Pattern Recognition: identifies the most relevant DSA pattern and explains the clues.
- Complexity Checker: reviews pasted solution code in a styled monospace textarea.
- Mock Interview: timed Clarifying Questions, Coding, and Discussion phases. When a phase expires, the frontend notifies the backend and the interview automatically moves to the next phase.

New sessions begin with situation cards and a free-form input. A first message entered without choosing a card is auto-routed by the backend classifier; once the conversation starts, the current mode can be changed with the input-area mode chip.

## Prerequisites

- Python 3.11+
- Node.js 18+
- A Gemini API key

## Setup

1. Copy the example environment file and add your Gemini API key:

```powershell
Copy-Item .env.example .env
```

Set `GEMINI_API_KEY` in `.env`. The key is read only by the backend; do not put it in frontend code. Optionally set `GEMINI_MODEL` to override the default model.

2. Start the backend:

```powershell
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

3. Start the frontend in a separate terminal:

```powershell
cd frontend
npm install
npm run dev
```

Open http://localhost:3000.

## Architecture

- Frontend: Next.js/React; session-only conversation, hint, and interview state.
- Backend: FastAPI; server-side mode prompts and Gemini calls.
- Streaming: `POST /chat` returns Server-Sent Events for progressive response rendering.
- Model: `gemini-2.0-flash` by default, overridable with `GEMINI_MODEL` in `.env`. This is a lighter, lower-latency option that is commonly used for chat-style tutoring flows and is a good default for this app. If Google changes availability, revisit this setting as needed.

## API

`POST /chat` accepts a mode, message, history, and mode-specific session state. For Mock Interview, the request includes `mock_interview_phase`; when its timer expires, it also includes `mock_interview_timer_expired: true`. The completed SSE event returns the next phase when a transition occurs.

## Scope

There is no database, user account system, or cross-session history. Docker packaging and AWS deployment are not yet included.
