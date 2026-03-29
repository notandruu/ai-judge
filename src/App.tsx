import { Routes, Route, Navigate, NavLink } from "react-router-dom";
import UploadPage from "./pages/UploadPage";
import JudgesPage from "./pages/JudgesPage";
import QueuePage from "./pages/QueuePage";
import ResultsPage from "./pages/ResultsPage";

const navItems = [
  { to: "/upload", label: "Upload" },
  { to: "/judges", label: "Judges" },
  { to: "/results", label: "Results" },
];

export default function App() {
  return (
    <div className="min-h-screen bg-white">
      <nav className="border-b border-gray-200 px-6 py-3 flex items-center gap-6">
        <span className="font-semibold text-lg">AI Judge</span>
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `text-sm ${isActive ? "text-black font-medium" : "text-gray-500 hover:text-gray-700"}`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
      <main className="p-6">
        <Routes>
          <Route path="/" element={<Navigate to="/upload" replace />} />
          <Route path="/upload" element={<UploadPage />} />
          <Route path="/judges" element={<JudgesPage />} />
          <Route path="/queue/:queueId" element={<QueuePage />} />
          <Route path="/results" element={<ResultsPage />} />
        </Routes>
      </main>
    </div>
  );
}
