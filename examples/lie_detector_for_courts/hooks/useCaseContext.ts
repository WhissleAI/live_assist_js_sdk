import { useState, useCallback, useRef, useMemo } from "react";
import type { PriorStatementChunk, EvidenceRef, ElementDef } from "../lib/types";
import { parsePriorStatements } from "../lib/case-parser";

export interface CaseContextState {
  witnessName: string;
  caseNumber: string;
  caseTheory: string;
  priorStatementsRaw: string;
  priorChunks: PriorStatementChunk[];
  evidenceRefs: EvidenceRef[];
  elements: ElementDef[];
}

export function useCaseContext() {
  const [state, setState] = useState<CaseContextState>({
    witnessName: "",
    caseNumber: "",
    caseTheory: "",
    priorStatementsRaw: "",
    priorChunks: [],
    evidenceRefs: [],
    elements: [],
  });

  const priorChunksRef = useRef<PriorStatementChunk[]>([]);
  priorChunksRef.current = state.priorChunks;

  const setWitnessName = useCallback((name: string) => {
    setState((s) => ({ ...s, witnessName: name }));
  }, []);

  const setCaseNumber = useCallback((num: string) => {
    setState((s) => ({ ...s, caseNumber: num }));
  }, []);

  const setCaseTheory = useCallback((theory: string) => {
    setState((s) => ({ ...s, caseTheory: theory }));
  }, []);

  const setPriorStatements = useCallback((text: string, sourceTitle?: string) => {
    const chunks = parsePriorStatements(text, sourceTitle || "Prior Statement");
    priorChunksRef.current = chunks;
    setState((s) => ({ ...s, priorStatementsRaw: text, priorChunks: chunks }));
  }, []);

  const addEvidenceRef = useCallback((ref: EvidenceRef) => {
    setState((s) => ({
      ...s,
      evidenceRefs: [...s.evidenceRefs, ref],
    }));
  }, []);

  const removeEvidenceRef = useCallback((id: string) => {
    setState((s) => ({
      ...s,
      evidenceRefs: s.evidenceRefs.filter((r) => r.id !== id),
    }));
  }, []);

  const addElement = useCallback((el: ElementDef) => {
    setState((s) => ({
      ...s,
      elements: [...s.elements, el],
    }));
  }, []);

  const removeElement = useCallback((id: string) => {
    setState((s) => ({
      ...s,
      elements: s.elements.filter((e) => e.id !== id),
    }));
  }, []);

  const setElements = useCallback((elements: ElementDef[]) => {
    setState((s) => ({ ...s, elements }));
  }, []);

  const agendaItems = useMemo(
    () =>
      state.elements.map((el) => ({
        id: el.id,
        title: el.title,
        status: "pending" as const,
        confidence: 0,
      })),
    [state.elements],
  );

  const buildCustomPrompt = useCallback((): string => {
    let prompt = `You are a cross-examination analyst assisting an attorney during live testimony.

ROLE: Analyze live testimony for contradictions, objections, and credibility issues.

WITNESS: ${state.witnessName || "Unknown"}
CASE: ${state.caseNumber || "Pending"}`;

    if (state.caseTheory.trim()) {
      prompt += `\n\nCASE THEORY:\n${state.caseTheory}`;
    }

    if (state.priorStatementsRaw.trim()) {
      prompt += `\n\n--- PRIOR STATEMENTS FOR COMPARISON ---\n${state.priorStatementsRaw}\n--- END PRIOR STATEMENTS ---`;
    }

    prompt += `

ANALYSIS INSTRUCTIONS:
1. CONTRADICTIONS: Compare live testimony against the PRIOR STATEMENTS above. For each contradiction found, output a line:
   CONTRADICTION: "topic" | HIGH/MEDIUM/LOW | Explanation with exact quotes from both live and prior testimony

2. OBJECTIONS: Flag objectionable testimony with:
   OBJECTION: TYPE | "triggering quote" | Legal basis

3. After any CONTRADICTION/OBJECTION lines, provide a brief analysis summary (2-3 sentences).

4. Then provide tactical suggestions prefixed with "Suggestions:"

Be precise. Cite exact quotes. Legal accuracy matters more than speed.
If no contradictions or objections are found, just provide the analysis summary and suggestions.`;

    return prompt;
  }, [state.witnessName, state.caseNumber, state.caseTheory, state.priorStatementsRaw]);

  return {
    state,
    priorChunksRef,
    setWitnessName,
    setCaseNumber,
    setCaseTheory,
    setPriorStatements,
    addEvidenceRef,
    removeEvidenceRef,
    addElement,
    removeElement,
    setElements,
    agendaItems,
    buildCustomPrompt,
  };
}
