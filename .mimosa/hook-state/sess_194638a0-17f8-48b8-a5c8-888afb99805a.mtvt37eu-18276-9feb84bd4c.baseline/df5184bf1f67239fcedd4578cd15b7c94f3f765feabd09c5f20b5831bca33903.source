import json
import logging
import os
import re
from contextlib import asynccontextmanager
from pathlib import Path
from typing import AsyncGenerator, Literal

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from prompts import INTENT_CLASSIFIER, PROMPTS

ENV_PATH = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(ENV_PATH)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ai-dsa-tutor")

GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta"
MODEL = os.getenv("GEMINI_MODEL", "gemini-flash-latest")

CORS_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3001",
]


def _mask_api_key_status() -> str:
    key = os.getenv("GEMINI_API_KEY", "").strip()
    if not key:
        return "NOT SET"
    if key in ("your-gemini-api-key-here", "your-api-key-here"):
        return "PLACEHOLDER (replace with a real key in .env)"
    return f"configured ({len(key)} chars)"


def _gemini_api_key() -> str:
    return os.getenv("GEMINI_API_KEY", "").strip()


def _is_valid_api_key(key: str) -> bool:
    return bool(key) and key not in ("your-gemini-api-key-here", "your-api-key-here")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("=== AI DSA Tutor API startup ===")
    logger.info("Env file: %s (exists=%s)", ENV_PATH, ENV_PATH.exists())
    logger.info("GEMINI_API_KEY: %s", _mask_api_key_status())
    logger.info("GEMINI_MODEL: %s", MODEL)
    logger.info("CORS origins: %s", ", ".join(CORS_ORIGINS))
    if not _is_valid_api_key(_gemini_api_key()):
        logger.warning("Gemini API key not configured — set GEMINI_API_KEY in .env")
    yield


app = FastAPI(title="AI DSA Tutor API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["*"],
)

HINT_TAG_RE = re.compile(r"\[HINT_ADVANCED:(true|false)\]", re.IGNORECASE)


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    mode: str = "hint_ladder"
    message: str
    history: list[ChatMessage] = Field(default_factory=list)
    hint_level: int = Field(default=1, ge=1, le=4)
    action: str | None = None  # "next_hint" when user clicks Next hint button
    mock_interview_phase: str | None = None
    mock_interview_timer_expired: bool = False


def next_mock_interview_phase(phase: str) -> str:
    phases = ["Clarifying Questions", "Coding", "Discussion"]
    try:
        return phases[min(phases.index(phase) + 1, len(phases) - 1)]
    except ValueError:
        return phases[0]


def build_system_prompt(req: ChatRequest, mock_interview_phase: str | None = None) -> str:
    base = PROMPTS.get(req.mode)
    if not base:
        raise HTTPException(status_code=400, detail=f"Unknown mode: {req.mode}")

    if req.mode == "mock_interview":
        phase = mock_interview_phase or req.mock_interview_phase or "Clarifying Questions"
        context = f"\n\n--- Session context ---\nCurrent interview phase: {phase}. Follow the rules for this phase on this call."
        if req.mock_interview_timer_expired:
            context += "\nThe previous phase's timer has run out. Open this response by naturally moving the candidate into the current phase, as an interviewer would."
        elif phase == "Clarifying Questions" and not req.history and req.message.strip():
            context += "\nThe user's first message is the actual interview problem. Present that problem to the candidate, then wait for clarifying questions before they start solving."
        return base + context

    if req.mode != "hint_ladder":
        return base

    level_desc = {1: "1 (conceptual nudge)", 2: "2 (concrete nudge)", 3: "3 (near-complete)", 4: "4 (full explanation allowed)"}
    context = f"\n\n--- Session context ---\nCurrent hint level: {level_desc.get(req.hint_level, str(req.hint_level))}"

    if req.action == "next_hint":
        context += (
            "\nThe user clicked 'Next hint'. DEFLECTION CHECK is required:"
            "\n- Find the user's most recent message in the conversation history (ignore this meta-request). Evaluate THAT message against the current hint."
            "\n- If they disengaged or skipped without attempting (e.g. 'idk', 'just tell me', no real effort), redirect at the CURRENT level — use [HINT_ADVANCED:false]."
            "\n- If they made a genuine attempt (even wrong), give the NEXT level hint — use [HINT_ADVANCED:true]."
            f"\n- If advancing, your hint should be for level {min(req.hint_level + 1, 4)}."
        )
    elif not req.history:
        context += (
            "\nThis is the user's FIRST message — they just described their problem."
            "\nDeliver hint level 1 (conceptual nudge) now. Do not wait for them to ask for a hint."
            "\nUse [HINT_ADVANCED:false]."
        )
    else:
        context += (
            "\nRespond at the CURRENT hint level. Do NOT advance the level on your own."
            "\nUse [HINT_ADVANCED:false] unless the user genuinely engaged and you are explicitly moving them forward."
        )

    return base + context


def strip_hint_tag(text: str) -> tuple[str, bool | None]:
    match = HINT_TAG_RE.search(text)
    if not match:
        return text.strip(), None
    advanced = match.group(1).lower() == "true"
    cleaned = HINT_TAG_RE.sub("", text).strip()
    return cleaned, advanced


def _sse(payload: dict) -> str:
    return f"data: {json.dumps(payload)}\n\n"


def _to_gemini_contents(messages: list[dict]) -> tuple[str | None, list[dict]]:
    system_instruction: str | None = None
    contents: list[dict] = []

    for msg in messages:
        role = msg["role"]
        text = msg["content"]
        if role == "system":
            system_instruction = text
        elif role == "user":
            contents.append({"role": "user", "parts": [{"text": text}]})
        elif role == "assistant":
            contents.append({"role": "model", "parts": [{"text": text}]})

    return system_instruction, contents


def _extract_gemini_text(chunk: dict) -> str:
    try:
        parts = chunk["candidates"][0]["content"]["parts"]
        return "".join(part.get("text", "") for part in parts)
    except (KeyError, IndexError, TypeError):
        return ""


def _gemini_request_body(
    messages: list[dict],
    *,
    temperature: float = 0.7,
    json_response: bool = False,
) -> dict:
    system_instruction, contents = _to_gemini_contents(messages)
    body: dict = {
        "contents": contents,
        "generationConfig": {"temperature": temperature},
    }
    if system_instruction:
        body["systemInstruction"] = {"parts": [{"text": system_instruction}]}
    if json_response:
        body["generationConfig"]["responseMimeType"] = "application/json"
    return body


async def stream_gemini(
    messages: list[dict], *, mock_interview_phase: str | None = None
) -> AsyncGenerator[str, None]:
    api_key = _gemini_api_key()
    if not _is_valid_api_key(api_key):
        yield _sse({"type": "error", "message": "GEMINI_API_KEY not configured — add it to .env at project root"})
        return

    body = _gemini_request_body(messages, temperature=0.7)
    url = f"{GEMINI_API_BASE}/models/{MODEL}:streamGenerateContent"

    try:
        full_text = ""
        async with httpx.AsyncClient(timeout=120.0) as http:
            async with http.stream(
                "POST",
                url,
                params={"key": api_key, "alt": "sse"},
                json=body,
                headers={"Content-Type": "application/json"},
            ) as response:
                if response.status_code != 200:
                    error_body = (await response.aread()).decode("utf-8", errors="replace")
                    try:
                        err_json = json.loads(error_body)
                        message = err_json.get("error", {}).get("message", error_body)
                    except json.JSONDecodeError:
                        message = error_body or f"HTTP {response.status_code}"
                    yield _sse({"type": "error", "message": f"LLM error: {message}"})
                    return

                async for line in response.aiter_lines():
                    if not line.startswith("data: "):
                        continue
                    try:
                        chunk = json.loads(line[6:])
                    except json.JSONDecodeError:
                        continue
                    delta = _extract_gemini_text(chunk)
                    if delta:
                        full_text += delta
                        yield _sse({"type": "token", "content": delta})

        cleaned, hint_advanced = strip_hint_tag(full_text)
        done_payload: dict = {"type": "done", "content": cleaned}
        if hint_advanced is not None:
            done_payload["hint_advanced"] = hint_advanced
        if mock_interview_phase:
            done_payload["mock_interview_phase"] = mock_interview_phase
        yield _sse(done_payload)
    except Exception as exc:
        logger.exception("Gemini streaming error")
        yield _sse({"type": "error", "message": f"LLM error: {type(exc).__name__}: {exc}"})


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "api_key": _mask_api_key_status(),
        "model": MODEL,
    }


@app.post("/chat")
async def chat(req: ChatRequest):
    logger.info(
        "POST /chat mode=%s hint_level=%s action=%s mock_interview_phase=%s",
        req.mode,
        req.hint_level,
        req.action,
        req.mock_interview_phase,
    )
    if not _is_valid_api_key(_gemini_api_key()):
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY not configured — add it to .env at project root")

    if not req.message.strip() and req.action != "next_hint" and not req.mock_interview_timer_expired:
        raise HTTPException(status_code=400, detail="Message cannot be empty")

    effective_mock_phase: str | None = None
    if req.mode == "mock_interview" and req.mock_interview_timer_expired:
        effective_mock_phase = next_mock_interview_phase(req.mock_interview_phase or "Clarifying Questions")

    system_prompt = build_system_prompt(req, effective_mock_phase)
    messages = [{"role": "system", "content": system_prompt}]
    for msg in req.history:
        messages.append({"role": msg.role, "content": msg.content})
    user_content = (
        "[User clicked 'Next hint' — evaluate their last real message in history for deflection.]"
        if req.action == "next_hint"
        else req.message
    )
    if req.mock_interview_timer_expired:
        user_content = "[The previous interview phase timer expired. Move the interview forward now.]"
    messages.append({"role": "user", "content": user_content})

    return StreamingResponse(
        stream_gemini(messages, mock_interview_phase=effective_mock_phase),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


class ClassifyRequest(BaseModel):
    message: str


class ClassifyResponse(BaseModel):
    mode: Literal[
        "hint_ladder",
        "brainstorming",
        "pattern_recognition",
        "complexity_checker",
        "mock_interview",
    ]


@app.post("/classify", response_model=ClassifyResponse)
async def classify_intent(req: ClassifyRequest):
    if not req.message.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty")

    """Lightweight intent classifier — used in step 3, stubbed for step 1."""
    api_key = _gemini_api_key()
    if not _is_valid_api_key(api_key):
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY not configured")

    body = _gemini_request_body(
        [
            {"role": "system", "content": INTENT_CLASSIFIER},
            {"role": "user", "content": req.message},
        ],
        temperature=0,
        json_response=True,
    )
    url = f"{GEMINI_API_BASE}/models/{MODEL}:generateContent"

    try:
        async with httpx.AsyncClient(timeout=60.0) as http:
            response = await http.post(
                url,
                params={"key": api_key},
                json=body,
                headers={"Content-Type": "application/json"},
            )
            if response.status_code != 200:
                try:
                    message = response.json().get("error", {}).get("message", response.text)
                except json.JSONDecodeError:
                    message = response.text
                raise HTTPException(status_code=502, detail=f"Gemini error: {message}")

            data = response.json()
            text = _extract_gemini_text(data)
            result = json.loads(text or "{}")
            return ClassifyResponse.model_validate(result)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Gemini classify error")
        raise HTTPException(status_code=502, detail=f"Gemini error: {exc}") from exc


PROJECT_ROOT = Path(__file__).resolve().parent.parent
FRONTEND_BUILD_DIR = PROJECT_ROOT / "frontend" / "out"
if FRONTEND_BUILD_DIR.exists():
    app.mount("/", StaticFiles(directory=str(FRONTEND_BUILD_DIR), html=True), name="frontend")

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)
