import { useState, useMemo, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { supabase } from "../lib/supabase";
import type { Verdict } from "../types/db";

// ── types ────────────────────────────────────────────────────────────────────

interface EvaluationRow {
  id: string;
  submission_id: string;
  question_id: string;
  judge_id: string;
  verdict: Verdict;
  reasoning: string;
  created_at: string;
  judges: { name: string } | null;
}

// ── data ─────────────────────────────────────────────────────────────────────

async function fetchEvaluations(): Promise<EvaluationRow[]> {
  const { data, error } = await supabase
    .from("evaluations")
    .select("*, judges(name)")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as EvaluationRow[];
}

// ── helpers ───────────────────────────────────────────────────────────────────

const VERDICT_STYLES: Record<Verdict, string> = {
  pass: "bg-green-100 text-green-700",
  fail: "bg-red-100 text-red-700",
  inconclusive: "bg-yellow-100 text-yellow-700",
};

function barColor(rate: number): string {
  if (rate >= 66) return "#22c55e";
  if (rate >= 33) return "#eab308";
  return "#ef4444";
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ── page ─────────────────────────────────────────────────────────────────────

export default function ResultsPage() {
  const { data: evaluations = [], isLoading, error } = useQuery({
    queryKey: ["evaluations"],
    queryFn: fetchEvaluations,
  });

  const [selectedJudges, setSelectedJudges] = useState<string[]>([]);
  const [selectedQuestions, setSelectedQuestions] = useState<string[]>([]);
  const [selectedVerdicts, setSelectedVerdicts] = useState<string[]>([]);

  // ── filter options derived from raw data ──
  const judgeOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const e of evaluations) {
      map.set(e.judge_id, e.judges?.name ?? e.judge_id);
    }
    return Array.from(map.entries()).map(([value, label]) => ({ value, label }));
  }, [evaluations]);

  const questionOptions = useMemo(() => {
    const set = new Set<string>();
    for (const e of evaluations) set.add(e.question_id);
    return Array.from(set).map((q) => ({ value: q, label: q }));
  }, [evaluations]);

  const verdictOptions: { value: string; label: string }[] = [
    { value: "pass", label: "Pass" },
    { value: "fail", label: "Fail" },
    { value: "inconclusive", label: "Inconclusive" },
  ];

  // ── filtered rows ──
  const filtered = useMemo(() => {
    return evaluations.filter((e) => {
      if (selectedJudges.length > 0 && !selectedJudges.includes(e.judge_id))
        return false;
      if (
        selectedQuestions.length > 0 &&
        !selectedQuestions.includes(e.question_id)
      )
        return false;
      if (
        selectedVerdicts.length > 0 &&
        !selectedVerdicts.includes(e.verdict)
      )
        return false;
      return true;
    });
  }, [evaluations, selectedJudges, selectedQuestions, selectedVerdicts]);

  // ── aggregate stats ──
  const passCount = filtered.filter((e) => e.verdict === "pass").length;
  const passRate =
    filtered.length > 0 ? Math.round((passCount / filtered.length) * 100) : 0;

  // ── per-judge pass rate for chart ──
  const chartData = useMemo(() => {
    const byJudge = new Map<
      string,
      { name: string; pass: number; total: number }
    >();
    for (const e of filtered) {
      const name = e.judges?.name ?? e.judge_id;
      if (!byJudge.has(e.judge_id)) {
        byJudge.set(e.judge_id, { name, pass: 0, total: 0 });
      }
      const entry = byJudge.get(e.judge_id)!;
      entry.total++;
      if (e.verdict === "pass") entry.pass++;
    }
    return Array.from(byJudge.values()).map((j) => ({
      name: j.name,
      rate: j.total > 0 ? Math.round((j.pass / j.total) * 100) : 0,
      total: j.total,
    }));
  }, [filtered]);

  // ── empty / loading / error ──
  if (isLoading) {
    return <p className="text-gray-400 text-sm mt-8 text-center">Loading…</p>;
  }

  if (error) {
    return (
      <p className="text-red-500 text-sm mt-8 text-center">
        {(error as Error).message}
      </p>
    );
  }

  if (evaluations.length === 0) {
    return (
      <div className="max-w-xl mx-auto mt-20 text-center">
        <p className="text-gray-500 text-sm mb-3">No evaluations yet.</p>
        <p className="text-gray-400 text-xs mb-4">
          Upload submissions, assign judges to questions, then run evaluations.
        </p>
        <Link
          to="/upload"
          className="text-sm text-blue-600 hover:underline"
        >
          Upload submissions →
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto">
      <h1 className="text-2xl font-semibold mb-6">Results</h1>

      {/* ── pass rate stat ── */}
      <div className="mb-6 p-4 bg-gray-50 border border-gray-200 rounded-lg flex items-center gap-6">
        <div>
          <p className="text-3xl font-bold text-gray-900">{passRate}%</p>
          <p className="text-sm text-gray-500 mt-0.5">
            pass of {filtered.length} evaluation
            {filtered.length !== 1 ? "s" : ""}
            {filtered.length !== evaluations.length &&
              ` (filtered from ${evaluations.length})`}
          </p>
        </div>
        <div className="flex gap-4 text-sm ml-4">
          {(["pass", "fail", "inconclusive"] as Verdict[]).map((v) => {
            const count = filtered.filter((e) => e.verdict === v).length;
            return (
              <div key={v} className="text-center">
                <p className="font-semibold text-gray-800">{count}</p>
                <p className="text-xs text-gray-400 capitalize">{v}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── animated bar chart ── */}
      {chartData.length > 0 && (
        <div className="mb-6 p-4 border border-gray-200 rounded-lg">
          <p className="text-xs font-medium text-gray-500 mb-3">
            Pass rate by judge
          </p>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart
              data={chartData}
              margin={{ top: 4, right: 16, left: 0, bottom: 4 }}
            >
              <XAxis
                dataKey="name"
                tick={{ fontSize: 12 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                domain={[0, 100]}
                tickFormatter={(v: number) => `${v}%`}
                tick={{ fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={36}
              />
              <Tooltip
                formatter={(value, _name, props) => [
                  `${value ?? 0}% (${(props.payload as { total: number }).total} evals)`,
                  "Pass rate",
                ]}
                cursor={{ fill: "rgba(0,0,0,0.04)" }}
              />
              <Bar dataKey="rate" radius={[4, 4, 0, 0]} isAnimationActive>
                {chartData.map((entry, i) => (
                  <Cell key={i} fill={barColor(entry.rate)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── filters ── */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <span className="text-xs text-gray-500 font-medium">Filter:</span>
        <MultiSelect
          placeholder="Judge"
          options={judgeOptions}
          selected={selectedJudges}
          onChange={setSelectedJudges}
        />
        <MultiSelect
          placeholder="Question"
          options={questionOptions}
          selected={selectedQuestions}
          onChange={setSelectedQuestions}
        />
        <MultiSelect
          placeholder="Verdict"
          options={verdictOptions}
          selected={selectedVerdicts}
          onChange={setSelectedVerdicts}
        />
        {(selectedJudges.length > 0 ||
          selectedQuestions.length > 0 ||
          selectedVerdicts.length > 0) && (
          <button
            onClick={() => {
              setSelectedJudges([]);
              setSelectedQuestions([]);
              setSelectedVerdicts([]);
            }}
            className="text-xs text-gray-400 hover:text-gray-600 underline"
          >
            Clear all
          </button>
        )}
      </div>

      {/* ── table ── */}
      {filtered.length === 0 ? (
        <p className="text-gray-400 text-sm text-center py-12">
          No evaluations match the current filters.
        </p>
      ) : (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-left">
                  <th className="px-3 py-2.5 text-xs font-medium text-gray-500 whitespace-nowrap">
                    Submission
                  </th>
                  <th className="px-3 py-2.5 text-xs font-medium text-gray-500 whitespace-nowrap">
                    Question
                  </th>
                  <th className="px-3 py-2.5 text-xs font-medium text-gray-500 whitespace-nowrap">
                    Judge
                  </th>
                  <th className="px-3 py-2.5 text-xs font-medium text-gray-500 whitespace-nowrap">
                    Verdict
                  </th>
                  <th className="px-3 py-2.5 text-xs font-medium text-gray-500">
                    Reasoning
                  </th>
                  <th className="px-3 py-2.5 text-xs font-medium text-gray-500 whitespace-nowrap">
                    Created
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((e) => (
                  <tr key={e.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-3 py-2.5 font-mono text-xs text-gray-600 whitespace-nowrap">
                      {e.submission_id}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs text-gray-600 max-w-[140px] truncate">
                      {e.question_id}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-gray-700 whitespace-nowrap">
                      {e.judges?.name ?? "—"}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${VERDICT_STYLES[e.verdict]}`}
                      >
                        {e.verdict}
                      </span>
                    </td>
                    <td
                      className="px-3 py-2.5 text-xs text-gray-600 max-w-xs"
                      title={e.reasoning}
                    >
                      <span className="line-clamp-2">{e.reasoning}</span>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-gray-400 whitespace-nowrap">
                      {fmtDate(e.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── MultiSelect ───────────────────────────────────────────────────────────────

interface SelectOption {
  value: string;
  label: string;
}

interface MultiSelectProps {
  placeholder: string;
  options: SelectOption[];
  selected: string[];
  onChange: (values: string[]) => void;
}

function MultiSelect({
  placeholder,
  options,
  selected,
  onChange,
}: MultiSelectProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  function toggle(value: string) {
    onChange(
      selected.includes(value)
        ? selected.filter((v) => v !== value)
        : [...selected, value]
    );
  }

  const label =
    selected.length === 0
      ? placeholder
      : `${placeholder}: ${selected.length}`;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`px-3 py-1.5 text-xs border rounded flex items-center gap-1.5 transition-colors ${
          selected.length > 0
            ? "border-black text-black bg-gray-50"
            : "border-gray-300 text-gray-600 hover:border-gray-400"
        }`}
      >
        {label}
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
          className={`transition-transform ${open ? "rotate-180" : ""}`}
        >
          <path
            d="M2 3.5l3 3 3-3"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 z-20 bg-white border border-gray-200 rounded-lg shadow-lg min-w-[180px]">
          {options.length === 0 ? (
            <p className="text-xs text-gray-400 px-3 py-2">No options</p>
          ) : (
            <ul className="py-1 max-h-52 overflow-y-auto">
              {options.map((opt) => (
                <li key={opt.value}>
                  <label className="flex items-center gap-2.5 px-3 py-1.5 hover:bg-gray-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selected.includes(opt.value)}
                      onChange={() => toggle(opt.value)}
                      className="rounded shrink-0"
                    />
                    <span className="text-xs text-gray-700 truncate">
                      {opt.label}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          {selected.length > 0 && (
            <div className="border-t border-gray-100 px-3 py-1.5">
              <button
                type="button"
                onClick={() => onChange([])}
                className="text-xs text-gray-400 hover:text-gray-600"
              >
                Clear
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
