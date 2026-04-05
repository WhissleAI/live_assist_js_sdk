import React, { useState } from "react";
import type { PatientDemographics } from "../lib/types";

interface Props {
  onComplete: (patient: PatientDemographics) => void;
}

export default function PatientIntake({ onComplete }: Props) {
  const [form, setForm] = useState<PatientDemographics>({
    age: 70,
    education_years: 14,
    sex: "female",
    handedness: "right",
    primary_language: "English",
    race_ethnicity: "",
    diagnosis: "",
    clinician_id: "",
  });

  const update = (field: keyof PatientDemographics, value: any) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onComplete(form);
  };

  return (
    <div className="app-content">
      <div className="card" style={{ maxWidth: 720, margin: "0 auto" }}>
        <div className="card-header">
          <h2>Patient Demographics</h2>
          <span className="badge badge-info">UDS-3 Form A1</span>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <div className="form-group">
              <label>Age</label>
              <input type="number" min={18} max={120} value={form.age} onChange={(e) => update("age", +e.target.value)} required />
            </div>
            <div className="form-group">
              <label>Years of Education</label>
              <input type="number" min={0} max={30} value={form.education_years} onChange={(e) => update("education_years", +e.target.value)} required />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Sex</label>
              <select value={form.sex} onChange={(e) => update("sex", e.target.value)}>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div className="form-group">
              <label>Handedness</label>
              <select value={form.handedness} onChange={(e) => update("handedness", e.target.value)}>
                <option value="right">Right</option>
                <option value="left">Left</option>
                <option value="ambidextrous">Ambidextrous</option>
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Primary Language</label>
              <input type="text" value={form.primary_language} onChange={(e) => update("primary_language", e.target.value)} />
            </div>
            <div className="form-group">
              <label>Race / Ethnicity</label>
              <input type="text" value={form.race_ethnicity} onChange={(e) => update("race_ethnicity", e.target.value)} />
            </div>
          </div>
          <div className="form-group">
            <label>Clinical Diagnosis (if known)</label>
            <input type="text" value={form.diagnosis} onChange={(e) => update("diagnosis", e.target.value)} placeholder="e.g., MCI, AD, Normal" />
          </div>
          <div className="form-group">
            <label>Examiner ID</label>
            <input type="text" value={form.clinician_id} onChange={(e) => update("clinician_id", e.target.value)} placeholder="Clinician or examiner identifier" />
          </div>
          <div style={{ marginTop: 24, textAlign: "right" }}>
            <button type="submit" className="btn btn-primary btn-lg">Continue to Battery Selection</button>
          </div>
        </form>
      </div>
    </div>
  );
}
