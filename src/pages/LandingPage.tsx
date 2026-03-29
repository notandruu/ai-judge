import { Link } from "react-router-dom";

const ACCENT = "#D4522A";

export default function LandingPage() {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden"
      style={{ backgroundColor: "#ffffff" }}
    >
      <div className="relative z-10 text-center max-w-sm px-8">
        <img
          src="/besimple-logo.png"
          alt="scoreio"
          className="w-10 h-10 object-contain mx-auto mb-8"
        />
        <h1
          className="mb-4 leading-none"
          style={{
            fontFamily: "'DM Serif Display', serif",
            fontSize: "4rem",
            color: ACCENT,
          }}
        >
          scoreio
        </h1>
        <h2
          className="mb-5 leading-snug"
          style={{
            fontFamily: "'DM Serif Display', serif",
            fontSize: "1.35rem",
            color: "#1a1a1a",
          }}
        >
          LLM evaluation layer for annotation queues
        </h2>
        <p className="text-sm leading-relaxed mb-8" style={{ color: "#6b6b6b" }}>
          Upload human-labeled submissions, define AI judges with custom rubrics,
          and run evaluations that automatically record pass / fail / inconclusive
          verdicts with reasoning.
        </p>
        <Link
          to="/upload"
          className="inline-flex items-center gap-1.5 px-5 py-2.5 text-sm text-white rounded-lg transition-opacity hover:opacity-90"
          style={{ backgroundColor: ACCENT }}
        >
          Get started →
        </Link>
      </div>

      <img
        src="/besimple-plant.png"
        alt=""
        aria-hidden="true"
        className="absolute bottom-0 right-0 w-72 object-contain object-bottom pointer-events-none"
      />
    </div>
  );
}
