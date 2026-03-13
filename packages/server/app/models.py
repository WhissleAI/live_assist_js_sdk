"""Pydantic models for the Live Assist SDK server."""

from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field


class AgendaItemModel(BaseModel):
    id: str
    title: str
    status: str = "pending"
    confidence: float = 0.0


class ProcessStreamRequest(BaseModel):
    transcript: str
    mode: str = "meeting"
    user_id: str = "sdk_user"
    device_id: str = ""
    context_filters: Dict[str, bool] = Field(default_factory=lambda: {"memories": True, "notes": False, "docs": False})
    user_personality: str = ""
    user_location: str = ""
    user_timezone: str = "UTC"
    documents_payload: List[Dict[str, Any]] = Field(default_factory=list)
    custom_prompt: Optional[str] = None
    agent_id: Optional[str] = None
    agenda_items: Optional[List[AgendaItemModel]] = None
    emotion_profile: Optional[Dict[str, float]] = None
    intent_signals: Optional[Dict[str, Dict[str, float]]] = None  # { user: {intent: prob}, other: {...} }
    voice_profile_summary: Optional[str] = None
    entities: Optional[List[Dict[str, str]]] = None


class SessionStartRequest(BaseModel):
    device_id: str = ""
    title: str = ""
    mode: str = "meeting"
    agenda: Optional[List[AgendaItemModel]] = None


class SessionEndRequest(BaseModel):
    session_id: str
    feedback_snapshot: Optional[Dict[str, Any]] = None
