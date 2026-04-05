import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import Dashboard from "@/pages/Dashboard";
import Pipeline from "@/pages/Pipeline";
import Signals from "@/pages/Signals";
import Predictions from "@/pages/Predictions";
import PredictionDetail from "@/pages/PredictionDetail";
import TrackRecord from "@/pages/TrackRecord";
import Watchlist from "@/pages/Watchlist";
import Analyze from "@/pages/Analyze";
import ModelPerformance from "@/pages/ModelPerformance";
import Settings from "@/pages/Settings";

export default function App() {
  return (
    <BrowserRouter>
      <AppShell>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/signals" element={<Signals />} />
          <Route path="/predictions" element={<Predictions />} />
          <Route path="/predictions/:id" element={<PredictionDetail />} />
          <Route path="/track-record" element={<TrackRecord />} />
          <Route path="/watchlist" element={<Watchlist />} />
          <Route path="/analyze" element={<Analyze />} />
          <Route path="/pipeline" element={<Pipeline />} />
          <Route path="/model" element={<ModelPerformance />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </AppShell>
    </BrowserRouter>
  );
}
