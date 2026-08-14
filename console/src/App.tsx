import { HashRouter, Route, Routes } from "react-router-dom";
import { Shell } from "./components/Shell";
import { LiveMonitor } from "./screens/LiveMonitor";
import { Investigation } from "./screens/Investigation";
import { Resilience } from "./screens/Resilience";
import { AuditChain } from "./screens/AuditChain";
import { DemoRunner } from "./screens/DemoRunner";
import { GraphView } from "./screens/GraphView";
import { Calibration } from "./screens/Calibration";
import { LatencyView } from "./screens/LatencyView";

function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<Shell />}>
          <Route index element={<LiveMonitor />} />
          <Route path="investigate" element={<Investigation />} />
          <Route path="resilience" element={<Resilience />} />
          <Route path="audit" element={<AuditChain />} />
          <Route path="demo" element={<DemoRunner />} />
          <Route path="time-machine" element={<Investigation timeMachine />} />
          <Route path="graph" element={<GraphView />} />
          <Route path="calibration" element={<Calibration />} />
          <Route path="latency" element={<LatencyView />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}

export default App;
