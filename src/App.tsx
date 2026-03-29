import { Routes, Route, NavLink, Outlet } from "react-router-dom";
import LandingPage from "./pages/LandingPage";
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

function DashboardLayout() {
  return (
    <div className="flex flex-col min-h-screen" style={{ backgroundColor: BG }}>
      <nav
        className="flex items-center gap-1 px-6 py-3 sticky top-0 z-10"
        style={{ backgroundColor: BG }}
      >
        <div className="flex items-center mr-5">
          <img
            src="/besimple-logo.png"
            alt="scoreio"
            className="w-7 h-7 object-contain"
          />
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

      <main className="flex-1 p-6 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route element={<DashboardLayout />}>
        <Route path="/upload" element={<UploadPage />} />
        <Route path="/judges" element={<JudgesPage />} />
        <Route path="/queue/:queueId" element={<QueuePage />} />
        <Route path="/results" element={<ResultsPage />} />
      </Route>
    </Routes>
  );
}
