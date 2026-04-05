"""
LangGraph-based Live Assist Workflow — SDK version.

Nodes:
1. extract_memories — vector search for relevant context
2. track_status — engagement, sentiment, keywords
3. generate_feedback — LLM streaming feedback (streaming node)
4. generate_actions — LLM action item extraction
"""

import json
import logging
import asyncio
import re
from typing import TypedDict, Optional, AsyncGenerator, List, Dict, Any
from dataclasses import dataclass, field

from .vector_memory import get_vector_memory
from .llm_client import get_llm_client

logger = logging.getLogger(__name__)


@dataclass
class LiveAssistContext:
    user_id: str
    mode: str
    context_filters: Dict[str, bool] = field(default_factory=dict)
    user_personality: Optional[str] = None
    user_timezone: str = "UTC"
    documents_payload: List[Dict] = field(default_factory=list)
    custom_prompt: Optional[str] = None
    emotion_profile: Optional[Dict[str, float]] = None
    intent_signals: Optional[Dict[str, Dict[str, float]]] = None  # { user: {intent: prob}, other: {...} }
    voice_profile_summary: Optional[str] = None
    entities: List[Dict[str, str]] = field(default_factory=list)
    agenda_items: Optional[List[Dict[str, Any]]] = None
    extra_data: Optional[Dict[str, Any]] = None


def _is_neuropsych_context(context: LiveAssistContext) -> bool:
    return context.mode == "neuropsych" or bool((context.extra_data or {}).get("test_type"))


@dataclass
class MemoryItem:
    id: str
    content: str
    title: str
    detail: str
    source: str
    category: str
    relevance_score: float
    highlighted_snippets: List[str] = field(default_factory=list)


@dataclass
class ActionItem:
    id: str
    title: str
    type: str
    description: Optional[str] = None
    priority: int = 0


@dataclass
class ConversationStatus:
    engagement_score: float
    sentiment_trend: str
    keywords: List[str]
    turn_count: int = 0


class LiveAssistState(TypedDict):
    transcript: str
    context: LiveAssistContext
    extracted_memories: List[MemoryItem]
    action_items: List[ActionItem]
    conversation_status: ConversationStatus
    feedback_chunks: List[str]
    feedback_summary: str
    suggestions: List[str]
    agenda_status: Optional[List[Dict[str, Any]]]
    gemini_api_key: Optional[str]
    stream_events: List[Dict[str, Any]]
    error: Optional[str]


def _extract_keywords(text: str) -> List[str]:
    """Simple keyword extraction from text."""
    stop = {"the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
            "have", "has", "had", "do", "does", "did", "will", "would", "could",
            "should", "may", "might", "shall", "can", "to", "of", "in", "for",
            "on", "with", "at", "by", "from", "as", "into", "about", "it", "its",
            "this", "that", "and", "or", "but", "not", "so", "if", "then", "than",
            "we", "you", "he", "she", "they", "i", "me", "my", "your", "our"}
    words = re.findall(r'\b[a-zA-Z]{3,}\b', text.lower())
    return [w for w in dict.fromkeys(words) if w not in stop][:15]


async def extract_memories_node(state: LiveAssistState) -> LiveAssistState:
    context = state["context"]
    if not context.context_filters.get("memories", True):
        state["extracted_memories"] = []
        return state

    vm = get_vector_memory()
    results = vm.search(user_id=context.user_id, query=state["transcript"], limit=10)
    memories = []
    for mem in results:
        content = mem.get("content", "")
        memories.append(MemoryItem(
            id=mem["id"], content=content,
            title=content[:80] + ("..." if len(content) > 80 else ""),
            detail=content[:120] + ("..." if len(content) > 120 else ""),
            source="memory", category=mem.get("category", "general"),
            relevance_score=mem.get("relevanceScore", 0.0),
        ))
    state["extracted_memories"] = memories
    state["stream_events"].append({
        "type": "memory",
        "data": {"items": [{"id": m.id, "title": m.title, "content": m.content, "detail": m.detail, "source": m.source, "category": m.category, "relevanceScore": m.relevance_score} for m in memories]},
    })
    logger.info("Extracted %d memories", len(memories))
    return state


async def track_status_node(state: LiveAssistState) -> LiveAssistState:
    context = state["context"]
    words = state["transcript"].split()
    engagement = min(10.0, len(words) / 10.0)
    sentiment = "neutral"
    if context.emotion_profile:
        happy = context.emotion_profile.get("HAPPY", 0.0)
        angry = context.emotion_profile.get("ANGRY", 0.0)
        total = happy + angry
        if total > 0.05:
            sentiment = "positive" if happy / total > 0.6 else ("negative" if happy / total < 0.4 else "neutral")

    keywords = _extract_keywords(state["transcript"])
    status = ConversationStatus(engagement_score=round(engagement, 1), sentiment_trend=sentiment, keywords=keywords)
    state["conversation_status"] = status
    state["stream_events"].append({"type": "status", "data": {"engagementScore": status.engagement_score, "sentimentTrend": status.sentiment_trend, "keywords": status.keywords}})
    return state


async def generate_feedback_node(state: LiveAssistState) -> AsyncGenerator[Dict[str, Any], None]:
    context = state["context"]
    memories = state["extracted_memories"]
    status = state["conversation_status"]

    memory_context = "\n".join([f"- {m.title}: {m.detail}" for m in memories[:5]]) if memories else ""
    personality_ctx = f"\nUser Personality: {context.user_personality}" if context.user_personality else ""
    intent_ctx = ""
    if context.intent_signals:
        parts = []
        for ch, probs in context.intent_signals.items():
            if probs:
                top = sorted(probs.items(), key=lambda x: -x[1])[:3]
                parts.append(f"{ch}: " + ", ".join(f"{k}({min(1, max(0, v)):.0%})" for k, v in top))
        if parts:
            intent_ctx = "\nIntent signals (use to refine agenda confidence): " + "; ".join(parts)
    instruction = (context.custom_prompt or "You are a live-assist companion providing real-time conversation feedback. Be concise and actionable.").strip()

    documents_ctx = ""
    if context.documents_payload:
        doc_parts = []
        for doc in context.documents_payload:
            title = doc.get("name") or doc.get("title") or "Document"
            content = doc.get("content", "")
            if content:
                doc_parts.append(f"[{title}]:\n{content}")
        if doc_parts:
            documents_ctx = "\n\n--- ATTACHED DOCUMENTS ---\n" + "\n\n".join(doc_parts) + "\n--- END DOCUMENTS ---"

    agenda_instruction = ""
    if context.agenda_items:
        agenda_lines = "\n".join(
            f'  - id="{a.get("id", "")}" title="{a.get("title", "")}" (current: {a.get("status", "pending")}, {a.get("confidence", 0)}%)'
            for a in context.agenda_items
        )
        first_id = context.agenda_items[0].get("id", "agenda_1") if context.agenda_items else "agenda_1"
        agenda_instruction = f"""

AGENDA TRACKING:
Evaluate each agenda item against the conversation. Return a JSON block on a NEW line prefixed with "AgendaStatus:".
CRITICAL: Use the EXACT id strings from the Items list below (e.g. "{first_id}"), NOT ag-1 or ag-2.

Confidence: 0=pending, 15-35=touched, 40-65=discussed, 70-84=thorough, 85-100=completed.
Each object: id (exact from list), status, confidence (0-100), sentiment, evidence (short reason).

Items:
{agenda_lines}

Example: AgendaStatus: [{{"id":"{first_id}","status":"in_progress","confidence":45,"sentiment":"neutral","evidence":"Briefly mentioned"}}]"""

    if context.agenda_items:
        prompt = f"""{instruction}

Transcript: {state['transcript']}
Mode: {context.mode}
Engagement: {status.engagement_score}/10
Sentiment: {status.sentiment_trend}
{personality_ctx}{intent_ctx}{documents_ctx}

Relevant Memories:
{memory_context or "(none)"}
{agenda_instruction}

Output in this exact order (use EXACT id strings from Items):
1. AgendaStatus: [{{"id":"<exact_id>","status":"pending|in_progress|completed","confidence":0-100,"sentiment":"neutral","evidence":"..."}}, ...]
2. Brief feedback summary (1-2 sentences).
3. Suggestions: (2-3 short phrases)"""
    else:
        prompt = f"""{instruction}

Transcript: {state['transcript']}
Mode: {context.mode}
Engagement: {status.engagement_score}/10
Sentiment: {status.sentiment_trend}
{personality_ctx}{intent_ctx}{documents_ctx}

Relevant Memories:
{memory_context or "(none)"}

Generate:
1. A brief feedback summary (1-2 sentences).
2. 2-3 conversation prompts (one short phrase each).

Respond in plain text, then list suggestions with "Suggestions:" prefix."""

    try:
        llm = get_llm_client()
        full_response = await asyncio.wait_for(llm.generate(prompt, max_tokens=768), timeout=30.0)
        logger.info("LLM response length: %d, agenda_items in context: %s", len(full_response), bool(context.agenda_items))

        # Extract agenda status if present (before stripping other content)
        agenda_status = None
        agenda_prefix_match = re.search(r"AgendaStatus:\s*\[", full_response, re.IGNORECASE | re.DOTALL)
        if not agenda_prefix_match:
            agenda_prefix_match = re.search(r"AgendaStatus:\s*\n\s*\[", full_response, re.IGNORECASE | re.DOTALL)
        if agenda_prefix_match:
            arr_start = agenda_prefix_match.end() - 1
            depth, i = 0, arr_start
            while i < len(full_response):
                ch = full_response[i]
                if ch == '"':
                    i += 1
                    while i < len(full_response) and full_response[i] != '"':
                        if full_response[i] == "\\":
                            i += 1
                        i += 1
                elif ch == "[":
                    depth += 1
                elif ch == "]":
                    depth -= 1
                    if depth == 0:
                        break
                i += 1
            if depth == 0 and i < len(full_response):
                json_str = full_response[arr_start : i + 1]
                try:
                    agenda_status = json.loads(json_str)
                    state["agenda_status"] = agenda_status
                    logger.info("Parsed agenda_status: %d items: %s", len(agenda_status), [a.get("id") for a in agenda_status])
                    # Emit status event with agenda so client gets incremental updates
                    yield {"type": "status", "data": {"agenda_status": agenda_status}}
                except (json.JSONDecodeError, Exception) as e:
                    logger.warning("Failed to parse agenda_status: %s. Raw snippet: %s", e, full_response[:300] if full_response else "")
                full_response = full_response[: agenda_prefix_match.start()] + full_response[i + 1 :]
        elif context.agenda_items:
            logger.warning("Agenda items in context but no AgendaStatus in LLM response. Response length=%d", len(full_response or ""))

        suggestions_match = re.search(r'\s*Suggestions?:\s*', full_response, re.IGNORECASE)
        if suggestions_match:
            summary = full_response[:suggestions_match.start()].strip()
            suggestions_text = full_response[suggestions_match.end():].strip()
            suggestions = [s.strip().lstrip("-*• ").strip() for s in re.split(r'[\n]+', suggestions_text) if s.strip() and len(s.strip()) > 2][:5]
        else:
            summary = full_response.strip()
            suggestions = ["Ask a follow-up question", "Share more details"]

        if not summary or len(summary) < 10:
            summary = "Conversation is being processed."

        state["feedback_summary"] = summary
        state["suggestions"] = suggestions

        words_list = summary.split()
        for i in range(0, len(words_list), 5):
            chunk = " ".join(words_list[i:i + 5]) + " "
            yield {"type": "feedback_chunk", "data": {"chunk": chunk}}

        yield {"type": "feedback", "data": {"summary": summary, "suggestions": suggestions}}
    except Exception as e:
        logger.error("Feedback generation failed: %s", e)
        fallback = "Processing conversation..."
        state["feedback_summary"] = fallback
        state["suggestions"] = ["Continue the conversation"]
        yield {"type": "error", "data": {"message": f"Feedback generation failed: {str(e)}"}}
        yield {"type": "feedback", "data": {"summary": fallback, "suggestions": state["suggestions"]}}


async def generate_actions_node(state: LiveAssistState) -> LiveAssistState:
    context = state["context"]
    memories = state["extracted_memories"]

    memory_context = "\n".join([f"- {m.title}" for m in memories[:3]]) if memories else ""
    prompt = f"""Based on this conversation, suggest 1-3 action items.

Transcript: {state['transcript']}
Mode: {context.mode}
Context: {memory_context}

Return JSON: {{"actionItems": [{{"title": "...", "type": "note|followup|calendar|email", "description": "...", "priority": 5}}]}}"""

    try:
        llm = get_llm_client()
        response = await asyncio.wait_for(llm.generate(prompt, max_tokens=300), timeout=15.0)
        json_match = re.search(r'\{', response)
        if json_match:
            start = json_match.start()
            depth, i = 0, start
            while i < len(response):
                ch = response[i]
                if ch == '"':
                    i += 1
                    while i < len(response) and response[i] != '"':
                        if response[i] == "\\":
                            i += 1
                        i += 1
                elif ch == "{":
                    depth += 1
                elif ch == "}":
                    depth -= 1
                    if depth == 0:
                        break
                i += 1
            if depth == 0:
                try:
                    obj = json.loads(response[start : i + 1])
                    actions_data = obj.get("actionItems", [])
                except json.JSONDecodeError:
                    actions_data = []
            else:
                actions_data = []
        else:
            actions_data = []
    except Exception as e:
        logger.warning("Action generation failed: %s", e)
        actions_data = []

    actions = [ActionItem(id=f"action_{i}", title=a.get("title", "Action"), type=a.get("type", "note"), description=a.get("description"), priority=a.get("priority", 5)) for i, a in enumerate(actions_data[:3])]
    state["action_items"] = actions
    state["stream_events"].append({"type": "action", "data": {"items": [{"id": a.id, "title": a.title, "type": a.type, "description": a.description, "priority": a.priority} for a in actions]}})
    return state


async def store_memories_node(state: LiveAssistState) -> LiveAssistState:
    """Store conversation chunks in vector memory."""
    context = state["context"]
    transcript = state["transcript"]
    if not transcript or len(transcript) < 50:
        return state
    try:
        vm = get_vector_memory()
        sentences = re.split(r'(?<=[.!?])\s+', transcript)
        chunk, stored = "", 0
        for sent in sentences:
            chunk += sent + " "
            if len(chunk) > 200:
                vm.store(user_id=context.user_id, content=chunk.strip(), category="conversation", source="live_assist")
                stored += 1
                chunk = ""
                if stored >= 20:
                    break
        if chunk.strip() and stored < 20:
            vm.store(user_id=context.user_id, content=chunk.strip(), category="conversation", source="live_assist")
        logger.info("Stored %d memory chunks", stored)
    except Exception as e:
        logger.warning("Memory storage failed: %s", e)
    return state


class LiveAssistWorkflow:
    async def process_streaming(self, transcript: str, context: LiveAssistContext, gemini_api_key: Optional[str] = None) -> AsyncGenerator[str, None]:
        if _is_neuropsych_context(context):
            from .neuropsych_service import stream_neuropsych_scoring
            ed = context.extra_data or {}
            body: Dict[str, Any] = {
                "test_type": ed.get("test_type"),
                "transcript": transcript,
                "words": ed.get("words", []),
                "pauses": ed.get("pauses", []),
                "speech_rate": ed.get("speech_rate"),
                "patient": ed.get("patient") or {},
                "duration_sec": ed.get("duration_sec"),
                "target_sequence": ed.get("target_sequence"),
                "target_word": ed.get("target_word"),
                "cue_level": ed.get("cue_level", "none"),
                "response_latency_sec": ed.get("response_latency_sec", 0.0),
            }
            async for chunk in stream_neuropsych_scoring(body):
                yield chunk
            return

        state: LiveAssistState = {
            "transcript": transcript, "context": context,
            "extracted_memories": [], "action_items": [],
            "conversation_status": ConversationStatus(0.0, "neutral", []),
            "feedback_chunks": [], "feedback_summary": "", "suggestions": [],
            "agenda_status": None,
            "gemini_api_key": gemini_api_key, "stream_events": [], "error": None,
        }

        # Phase 1: fast context (no LLM)
        try:
            state = await extract_memories_node(state)
        except Exception as e:
            logger.warning("Memory extraction failed: %s", e)
        for ev in state.get("stream_events", []):
            if ev.get("type") == "memory":
                yield f"data: {json.dumps(ev)}\n\n"

        try:
            state = await track_status_node(state)
        except Exception as e:
            logger.warning("Status tracking failed: %s", e)
        for ev in state.get("stream_events", []):
            if ev.get("type") == "status":
                yield f"data: {json.dumps(ev)}\n\n"

        # Phase 2: LLM calls in parallel
        async def _run_actions():
            nonlocal state
            try:
                state = await generate_actions_node(state)
            except Exception as e:
                logger.warning("Action generation failed: %s", e)

        actions_task = asyncio.create_task(_run_actions())
        async for ev in generate_feedback_node(state):
            yield f"data: {json.dumps(ev)}\n\n"
        try:
            await asyncio.wait_for(asyncio.shield(actions_task), timeout=5.0)
        except (asyncio.TimeoutError, Exception):
            pass

        for ev in state.get("stream_events", []):
            if ev.get("type") == "action":
                yield f"data: {json.dumps(ev)}\n\n"

        asyncio.create_task(self._store_bg(state))

        done_data: Dict[str, Any] = {
            "success": True,
            "feedbackSummary": state.get("feedback_summary", ""),
            "suggestions": state.get("suggestions", []),
            "knowledgeItems": [{"id": m.id, "title": m.title, "content": m.content, "source": m.source} for m in state.get("extracted_memories", [])],
            "actionItems": [{"id": a.id, "title": a.title, "type": a.type, "description": a.description, "priority": a.priority} for a in state.get("action_items", [])],
            "engagementScore": state["conversation_status"].engagement_score,
            "sentimentTrend": state["conversation_status"].sentiment_trend,
            "keywords": state["conversation_status"].keywords,
            "mode": context.mode,
        }
        if state.get("agenda_status"):
            done_data["agenda_status"] = state["agenda_status"]
        done_event = {"type": "done", "data": done_data}
        yield f"data: {json.dumps(done_event)}\n\n"

    @staticmethod
    async def _store_bg(state: LiveAssistState):
        try:
            await store_memories_node(state)
        except Exception as e:
            logger.warning("Background storage failed: %s", e)
