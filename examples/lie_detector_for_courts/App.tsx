import React, { useState, useCallback, useEffect } from "react";
import type { CaseConfig, ExaminationState } from "./lib/types";
import { parsePriorStatements } from "./lib/case-parser";
import type { PriorStatementChunk } from "./lib/types";
import { useCaseContext } from "./hooks/useCaseContext";
import { gatewayConfig } from "./lib/gateway-config";
import CaseSetup from "./components/CaseSetup";
import ExaminationSession from "./components/ExaminationSession";
import SessionReport from "./components/SessionReport";

type Phase = "setup" | "examination" | "report";

export default function App() {
  const [phase, setPhase] = useState<Phase>("setup");
  const [config, setConfig] = useState<CaseConfig | null>(null);
  const [priorChunks, setPriorChunks] = useState<PriorStatementChunk[]>([]);
  const [customPrompt, setCustomPrompt] = useState("");
  const [agendaItems, setAgendaItems] = useState<
    Array<{ id: string; title: string; status: string; confidence: number }>
  >([]);
  const [lastExamState, setLastExamState] = useState<ExaminationState | null>(null);

  const caseCtx = useCaseContext();

  useEffect(() => {
    gatewayConfig.initSession().catch(() => {});
  }, []);

  const handleSetupDone = useCallback(
    (cfg: CaseConfig) => {
      setConfig(cfg);

      caseCtx.setWitnessName(cfg.witnessName);
      caseCtx.setCaseNumber(cfg.caseNumber);
      caseCtx.setCaseTheory(cfg.caseTheory);
      caseCtx.setPriorStatements(cfg.priorStatements);
      caseCtx.setElements(cfg.elements);

      const chunks = parsePriorStatements(cfg.priorStatements, "Prior Statement");
      setPriorChunks(chunks);

      const items = cfg.elements.map((el) => ({
        id: el.id,
        title: el.title,
        status: "pending" as const,
        confidence: 0,
      }));
      setAgendaItems(items);

      let prompt = `You are a cross-examination analyst assisting an attorney during live testimony.

ROLE: Analyze live testimony for contradictions, objections, and credibility issues.

WITNESS: ${cfg.witnessName || "Unknown"}
CASE: ${cfg.caseNumber || "Pending"}`;

      if (cfg.caseTheory.trim()) {
        prompt += `\n\nCASE THEORY:\n${cfg.caseTheory}`;
      }

      if (cfg.priorStatements.trim()) {
        prompt += `\n\n--- PRIOR STATEMENTS FOR COMPARISON ---\n${cfg.priorStatements}\n--- END PRIOR STATEMENTS ---`;
      }

      prompt += `

ANALYSIS INSTRUCTIONS:
1. CONTRADICTIONS: Compare live testimony against the PRIOR STATEMENTS above. For each contradiction found, output a line:
   CONTRADICTION: "topic" | HIGH/MEDIUM/LOW | Explanation with exact quotes

2. OBJECTIONS: Flag objectionable testimony:
   OBJECTION: TYPE | "triggering quote" | Legal basis

3. After any CONTRADICTION/OBJECTION lines, provide a brief analysis summary (2-3 sentences).

4. Then provide tactical suggestions prefixed with "Suggestions:"

Be precise. Cite exact quotes. Legal accuracy matters.
If no contradictions or objections are found, just provide the analysis summary and suggestions.`;

      setCustomPrompt(prompt);
      setPhase("examination");
    },
    [caseCtx],
  );

  const handleExamEnd = useCallback((finalState?: ExaminationState) => {
    if (finalState) setLastExamState(finalState);
    setPhase("report");
  }, []);

  const handleNewSession = useCallback(() => {
    if (config) {
      setPhase("examination");
    } else {
      setPhase("setup");
    }
  }, [config]);

  const handleBackToSetup = useCallback(() => {
    setConfig(null);
    setPriorChunks([]);
    setCustomPrompt("");
    setAgendaItems([]);
    setPhase("setup");
  }, []);

  if (phase === "setup") {
    return <CaseSetup onDone={handleSetupDone} />;
  }

  if (phase === "examination" && config) {
    return (
      <ExaminationSession
        config={config}
        priorChunks={priorChunks}
        customPrompt={customPrompt}
        agendaItems={agendaItems}
        onEnd={handleExamEnd}
      />
    );
  }

  if (phase === "report") {
    const examState: ExaminationState = lastExamState ?? {
      isActive: false,
      isListening: false,
      segments: [],
      qaPairs: [],
      objections: [],
      discrepancies: [],
      elements: agendaItems.map((a) => ({
        id: a.id,
        title: a.title,
        status: "pending" as const,
        confidence: 0,
        sentiment: "neutral",
        evidence: "",
      })),
      witnessEmotion: "NEUTRAL",
      witnessCredibility: 50,
      witnessVocalStability: 100,
      counselEmotion: "NEUTRAL",
      keywords: [],
      feedbackSummary: "",
      suggestions: [],
      elapsedSec: 0,
      error: null,
    };

    return (
      <SessionReport
        state={examState}
        witnessName={config?.witnessName ?? "Witness"}
        caseNumber={config?.caseNumber ?? ""}
        onNewSession={handleNewSession}
        onBackToSetup={handleBackToSetup}
      />
    );
  }

  return <CaseSetup onDone={handleSetupDone} />;
}
