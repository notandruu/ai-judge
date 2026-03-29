import { Routes, Route, Navigate, NavLink } from "react-router-dom";
import UploadPage from "./pages/UploadPage";
import JudgesPage from "./pages/JudgesPage";
import QueuePage from "./pages/QueuePage";
import ResultsPage from "./pages/ResultsPage";

const ACCENT = "#D4522A";
const BG = "#ffffff";

const navItems = [
  { to: "/upload", label: "Upload" },
  { to: "/judges", label: "Judges" },
  { to: "/results", label: "Results" },
];

export default function App() {
  return (
    <div className="flex min-h-screen" style={{ backgroundColor: BG }}>

      {/* ── LEFT: app ─────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-h-screen min-w-0">

        {/* nav */}
        <nav
          className="flex items-center gap-1 px-6 py-3 sticky top-0 z-10"
          style={{ backgroundColor: BG }}
        >
          <div className="flex items-center mr-5">
            <img src="/besimple-logo.png" alt="beSimple AI" className="w-7 h-7 object-contain" />
          </div>
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `text-sm px-3 py-1.5 rounded-lg transition-colors ${
                  isActive ? "font-medium" : "hover:bg-black/5"
                }`
              }
              style={({ isActive }) =>
                isActive
                  ? { color: ACCENT, backgroundColor: "rgba(212,82,42,0.08)" }
                  : { color: "#9e9e9e" }
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* page content */}
        <main className="flex-1 p-6 overflow-y-auto">
          <Routes>
            <Route path="/" element={<Navigate to="/upload" replace />} />
            <Route path="/upload" element={<UploadPage />} />
            <Route path="/judges" element={<JudgesPage />} />
            <Route path="/queue/:queueId" element={<QueuePage />} />
            <Route path="/results" element={<ResultsPage />} />
          </Routes>
        </main>
      </div>

      {/* ── RIGHT: description + illustration ────────────────────────── */}
      <div
        className="w-[320px] shrink-0 sticky top-0 h-screen relative overflow-hidden flex flex-col"
        style={{ backgroundColor: BG }}
      >
        <div className="px-8 pt-12 pb-0">
          <p
            className="leading-none mb-5"
            style={{ fontFamily: "'DM Serif Display', serif", fontSize: "2rem", color: ACCENT }}
          >
            scoreio
          </p>
          <h2
            className="text-[1.6rem] leading-tight mb-5"
            style={{ fontFamily: "'DM Serif Display', serif", color: "#1a1a1a" }}
          >
            LLM evaluation layer for annotation queues
          </h2>
          <p className="text-sm leading-relaxed" style={{ color: "#6b6b6b" }}>
            Upload a batch of human-labeled submissions, define AI judges with
            custom rubrics, assign them to questions, and run evaluations that
            automatically record a pass / fail / inconclusive verdict with
            reasoning for every answer.
          </p>
        </div>
        <img
          src="/besimple-plant.png"
          alt=""
          aria-hidden="true"
          className="absolute bottom-0 right-0 w-full object-contain object-bottom"
          style={{ maxHeight: "55%" }}
        />
      </div>

    </div>
  );
}
