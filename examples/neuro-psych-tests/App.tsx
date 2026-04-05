import React, { useEffect, useCallback } from "react";
import { useNeuroPsychSession } from "./hooks/useNeuroPsychSession";
import { gatewayConfig } from "./lib/gateway-config";
import type { TestType, TestResult } from "./lib/types";
import PatientIntake from "./components/PatientIntake";
import BatterySelection from "./components/BatterySelection";
import TestShell from "./components/TestShell";
import DelayScreen from "./components/DelayScreen";
import ScoringDashboard from "./components/ScoringDashboard";
import ClinicalReport from "./components/ClinicalReport";
import CraftStoryTest from "./components/tests/CraftStoryTest";
import CategoryFluencyTest from "./components/tests/CategoryFluencyTest";
import LetterFluencyTest from "./components/tests/LetterFluencyTest";
import DigitSpanTest from "./components/tests/DigitSpanTest";
import TrailMakingTest from "./components/tests/TrailMakingTest";
import NamingTest from "./components/tests/NamingTest";

export default function App() {
  const session = useNeuroPsychSession();

  useEffect(() => {
    gatewayConfig.initSession().catch(() => {});
  }, []);

  const handleExportNACC = useCallback(async () => {
    try {
      const sessionResults: Record<string, any> = {};
      for (const r of session.results) {
        sessionResults[r.test_type] = r.scoring;
      }

      const res = await fetch(`${gatewayConfig.httpBase}/neuropsych/export/nacc`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_results: sessionResults,
          patient_id: session.patient?.clinician_id || "",
          visit_date: new Date().toISOString().split("T")[0],
        }),
      });

      const data = await res.json();
      if (data.csv) {
        const blob = new Blob([data.csv], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `nacc_uds_c2_${new Date().toISOString().split("T")[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error("NACC export failed:", err);
    }
  }, [session.results, session.patient]);

  const handlePrint = useCallback(() => window.print(), []);

  const renderTest = (testType: TestType) => {
    if (!session.patient) return null;
    const remountKey = `${testType}-${session.currentTestIdx}`;
    const props = {
      patient: session.patient,
      onComplete: (result: TestResult) => session.completeTest(result),
      testIndex: session.currentTestIdx,
      totalTests: session.battery.length,
    };

    switch (testType) {
      case "craft_story_immediate":
      case "craft_story_delayed":
        return <CraftStoryTest key={remountKey} testType={testType} {...props} />;
      case "category_fluency_animals":
      case "category_fluency_vegetables":
        return <CategoryFluencyTest key={remountKey} testType={testType} {...props} />;
      case "letter_fluency_f":
      case "letter_fluency_l":
        return <LetterFluencyTest key={remountKey} testType={testType} {...props} />;
      case "digit_span_forward":
      case "digit_span_backward":
        return <DigitSpanTest key={remountKey} testType={testType} {...props} />;
      case "trail_making_a":
      case "trail_making_b":
        return <TrailMakingTest key={remountKey} testType={testType} {...props} />;
      case "naming":
        return <NamingTest key={remountKey} {...props} />;
      default:
        return <div>Unknown test type: {testType}</div>;
    }
  };

  return (
    <>
      <header className="app-header">
        <div>
          <h1>UDS-3 Neuropsychological Test Battery</h1>
          <span className="subtitle">UCSF Memory and Aging Center &middot; Powered by Whissle</span>
        </div>
        {session.phase !== "intake" && (
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            {session.patient && (
              <span style={{ fontSize: "0.8rem", opacity: 0.8 }}>
                Age {session.patient.age} &middot; {session.patient.education_years}yr edu
              </span>
            )}
          </div>
        )}
      </header>

      {session.phase === "intake" && (
        <PatientIntake onComplete={session.completeIntake} />
      )}

      {session.phase === "battery" && (
        <BatterySelection
          onSelect={session.selectBattery}
          onBack={() => session.setPhase("intake")}
        />
      )}

      {session.phase === "testing" && session.currentTest && (
        renderTest(session.currentTest)
      )}

      {session.phase === "delay" && (
        <DelayScreen
          onResume={session.resumeAfterDelay}
          onSkip={session.skipDelay}
        />
      )}

      {session.phase === "scoring" && (
        <ScoringDashboard
          results={session.results}
          onContinue={session.finishScoring}
        />
      )}

      {session.phase === "report" && (
        <ClinicalReport
          session={session.session}
          onExportNACC={handleExportNACC}
          onPrint={handlePrint}
          onNewSession={session.resetSession}
        />
      )}
    </>
  );
}
