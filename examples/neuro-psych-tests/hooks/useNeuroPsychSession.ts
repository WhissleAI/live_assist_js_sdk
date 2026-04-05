import { useState, useCallback } from "react";
import type { PatientDemographics, TestType, TestResult, DomainScore, NeuroPsychSession, SessionPhase } from "../lib/types";
import { computeDomainScores } from "../lib/scoring/composite";

function generateId(): string {
  return `nps_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function useNeuroPsychSession() {
  const [phase, setPhase] = useState<SessionPhase>("intake");
  const [patient, setPatient] = useState<PatientDemographics | null>(null);
  const [battery, setBattery] = useState<TestType[]>([]);
  const [results, setResults] = useState<TestResult[]>([]);
  const [currentTestIdx, setCurrentTestIdx] = useState(0);
  const [examinerNotes, setExaminerNotes] = useState("");
  const [sessionId] = useState(generateId);
  const [startedAt] = useState(Date.now);
  const [domainScores, setDomainScores] = useState<DomainScore[]>([]);
  const [delayNeeded, setDelayNeeded] = useState(false);

  const currentTest: TestType | null = currentTestIdx < battery.length ? battery[currentTestIdx] : null;
  const progress = battery.length ? currentTestIdx / battery.length : 0;

  const completeIntake = useCallback((p: PatientDemographics) => {
    setPatient(p);
    setPhase("battery");
  }, []);

  const selectBattery = useCallback((tests: TestType[]) => {
    setBattery(tests);
    setCurrentTestIdx(0);
    setPhase("testing");
  }, []);

  const completeTest = useCallback((result: TestResult) => {
    setResults((prev) => [...prev, result]);
    const nextIdx = currentTestIdx + 1;

    if (result.test_type === "craft_story_immediate" && battery.includes("craft_story_delayed")) {
      const delayIdx = battery.indexOf("craft_story_delayed");
      if (delayIdx > nextIdx) {
        setCurrentTestIdx(nextIdx);
        setDelayNeeded(true);
        setPhase("delay");
        return;
      }
    }

    if (nextIdx >= battery.length) {
      const allResults = [...results, result];
      setDomainScores(computeDomainScores(allResults));
      setPhase("scoring");
    } else {
      setCurrentTestIdx(nextIdx);
    }
  }, [currentTestIdx, battery, results]);

  const resumeAfterDelay = useCallback(() => {
    setDelayNeeded(false);
    setPhase("testing");
  }, []);

  const skipDelay = useCallback(() => {
    setDelayNeeded(false);
    setPhase("testing");
  }, []);

  const finishScoring = useCallback(() => {
    setDomainScores(computeDomainScores(results));
    setPhase("report");
  }, [results]);

  const resetSession = useCallback(() => {
    setPhase("intake");
    setPatient(null);
    setBattery([]);
    setResults([]);
    setCurrentTestIdx(0);
    setDomainScores([]);
    setDelayNeeded(false);
    setExaminerNotes("");
  }, []);

  const session: NeuroPsychSession = {
    id: sessionId,
    patient: patient!,
    battery,
    results,
    domain_scores: domainScores,
    started_at: startedAt,
    completed_at: phase === "report" ? Date.now() : null,
    examiner_notes: examinerNotes,
  };

  return {
    phase,
    setPhase,
    patient,
    battery,
    results,
    currentTest,
    currentTestIdx,
    progress,
    examinerNotes,
    setExaminerNotes,
    domainScores,
    delayNeeded,
    session,
    completeIntake,
    selectBattery,
    completeTest,
    resumeAfterDelay,
    skipDelay,
    finishScoring,
    resetSession,
  };
}
