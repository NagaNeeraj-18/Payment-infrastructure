import type { ReactNode } from "react";
import { NavLink, Outlet } from "react-router-dom";

const NAV: { to: string; label: string }[] = [
  { to: "/", label: "Live Monitor" },
  { to: "/investigate", label: "Investigation" },
  { to: "/resilience", label: "Resilience" },
  { to: "/audit", label: "Audit Chain" },
  { to: "/demo", label: "Demo Runner" },
  { to: "/time-machine", label: "Time Machine" },
  { to: "/graph", label: "Graph / Ring" },
  { to: "/calibration", label: "Calibration" },
  { to: "/latency", label: "Latency" },
];

export function Shell(): ReactNode {
  return (
    <div className="grid min-h-screen" style={{ gridTemplateColumns: "190px 1fr" }}>
      <nav
        className="sticky top-0 h-screen"
        style={{ background: "var(--panel)", borderRight: "1px solid var(--line)", padding: "18px 0" }}
      >
        <div className="flex items-center gap-2" style={{ padding: "0 18px 20px" }}>
          <span
            style={{ width: 20, height: 20, background: "var(--ultra-500)", borderRadius: 2, display: "block", flex: "none" }}
          />
          <b className="mono" style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase" }}>
            Nazar
          </b>
        </div>
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            className={({ isActive }) => `nav-link ${isActive ? "on" : ""}`}
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
      <main style={{ padding: "0 34px 90px", maxWidth: 1200 }}>
        <Outlet />
      </main>
    </div>
  );
}
