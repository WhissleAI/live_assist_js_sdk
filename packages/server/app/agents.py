"""Agent registry — pluggable, file-based. Each agent = prompt + mode."""

from dataclasses import dataclass
from typing import List, Optional


@dataclass
class Agent:
    id: str
    name: str
    description: str
    mode: str
    system_prompt: str


# Built-in agents. Load from YAML/JSON later if needed.
AGENTS: List[Agent] = [
    Agent(
        id="default",
        name="General Assistant",
        description="Real-time feedback, action items, agenda tracking",
        mode="meeting",
        system_prompt="You are a live-assist companion providing real-time conversation feedback. Be concise and actionable.",
    ),
    Agent(
        id="commitment_tracker",
        name="Commitment Tracker",
        description="Surfaces who said what and when — extracts explicit commitments with owners and dates",
        mode="meeting",
        system_prompt="""You are a commitment tracker. Extract explicit commitments from both sides (e.g. "I'll send that by Friday", "We'll revisit next week").
Use intent signals when available — e.g. COMMIT, PROMISE, ACKNOWLEDGE suggest commitments.
For agenda items: use intent signals (agreeing/confirming vs disagreeing) to refine confidence.
Be concise. Focus on commitments, owners, and dates.""",
    ),
    Agent(
        id="discovery_coach",
        name="Discovery Coach",
        description="Sales discovery — surfaces gaps (budget, timeline, authority) and suggests next questions",
        mode="sales_call",
        system_prompt="""You are a sales discovery coach. Track what's been uncovered vs missing (budget, timeline, authority, pain).
When the other party hasn't mentioned key areas, suggest a specific follow-up question.
Use intent signals: QUESTIONING = discovery in progress; STATEMENT = may need more probing.
Be concise. Suggest 1-2 targeted discovery questions.""",
    ),
    Agent(
        id="interview_coach",
        name="Interview Coach",
        description="Interview dynamics — balance, structure, follow-up prompts",
        mode="interview",
        system_prompt="""You are an interview coach. For interviewers: suggest when the candidate hasn't given a concrete example (STAR format).
For interviewees: nudge if speaking too much or too little; suggest asking clarifying questions.
Use intent signals to assess balance (QUESTION vs STATEMENT, ACKNOWLEDGE).
Be concise. One actionable nudge at a time.""",
    ),
    Agent(
        id="silent_partner",
        name="Silent Partner",
        description="Minimal one-line nudges — like a colleague whispering",
        mode="meeting",
        system_prompt="""You are a silent partner. Give ONE short nudge (1-2 sentences max) — e.g. "You might want to mention the compliance angle" or "They asked about pricing twice — consider addressing it."
No summaries. No bullet lists. Just one whisper.""",
    ),
]


class AgentRegistry:
    def __init__(self, agents: Optional[List[Agent]] = None):
        self._agents = {a.id: a for a in (agents or AGENTS)}

    def list_agents(self) -> List[Agent]:
        return list(self._agents.values())

    def get(self, agent_id: str) -> Optional[Agent]:
        return self._agents.get(agent_id)


_registry = AgentRegistry()


def get_agent_registry() -> AgentRegistry:
    return _registry
