import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import type {
  Submission,
  Judge,
  JudgeAssignment,
  SubmissionQuestion,
} from "../types/db";

// ── data helpers ────────────────────────────────────────────────────────────

async function fetchSubmissions(queueId: string): Promise<Submission[]> {
  const { data, error } = await supabase
    .from("submissions")
    .select("*")
    .eq("queue_id", queueId);
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function fetchActiveJudges(): Promise<Judge[]> {
  const { data, error } = await supabase
    .from("judges")
    .select("*")
    .eq("active", true)
    .order("name");
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function fetchAssignments(queueId: string): Promise<JudgeAssignment[]> {
  const { data, error } = await supabase
    .from("judge_assignments")
    .select("*")
    .eq("queue_id", queueId);
  if (error) throw new Error(error.message);
  return data ?? [];
}

function extractQuestions(submissions: Submission[]): SubmissionQuestion[] {
  const seen = new Set<string>();
  const questions: SubmissionQuestion[] = [];
  for (const s of submissions) {
    for (const q of s.raw_json.questions) {
      if (!seen.has(q.data.id)) {
        seen.add(q.data.id);
        questions.push(q);
      }
    }
  }
  return questions;
}

// ── edge function call ───────────────────────────────────────────────────────

interface RunResult {
  planned: number;
  completed: number;
  failed: number;
}

async function runEvaluations(queueId: string): Promise<RunResult> {
  const { data, error } = await supabase.functions.invoke<RunResult>(
    "run-evaluations",
    { body: { queueId } }
  );
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Empty response from edge function");
  return data;
}

// ── page ────────────────────────────────────────────────────────────────────

export default function QueuePage() {
  const { queueId } = useParams<{ queueId: string }>();
  const qc = useQueryClient();

  const {
    data: submissions = [],
    isLoading: loadingSubs,
    error: subsError,
  } = useQuery({
    queryKey: ["submissions", queueId],
    queryFn: () => fetchSubmissions(queueId!),
    enabled: !!queueId,
  });

  const { data: judges = [], isLoading: loadingJudges } = useQuery({
    queryKey: ["judges", "active"],
    queryFn: fetchActiveJudges,
  });

  const {
    data: assignments = [],
    isLoading: loadingAssignments,
  } = useQuery({
    queryKey: ["assignments", queueId],
    queryFn: () => fetchAssignments(queueId!),
    enabled: !!queueId,
  });

  const toggleMutation = useMutation({
    mutationFn: async ({
      questionId,
      judgeId,
      assigned,
    }: {
      questionId: string;
      judgeId: string;
      assigned: boolean;
    }) => {
      if (assigned) {
        const { error } = await supabase
          .from("judge_assignments")
          .delete()
          .eq("queue_id", queueId!)
          .eq("question_id", questionId)
          .eq("judge_id", judgeId);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabase.from("judge_assignments").insert({
          queue_id: queueId!,
          question_id: questionId,
          judge_id: judgeId,
        });
        if (error) throw new Error(error.message);
      }
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["assignments", queueId] }),
  });

  const runMutation = useMutation({
    mutationFn: () => runEvaluations(queueId!),
  });

  if (!queueId) {
    return <p className="text-red-500 text-sm">No queue ID in URL.</p>;
  }

  const isLoading = loadingSubs || loadingJudges || loadingAssignments;
  const questions = extractQuestions(submissions);
  const assignedSet = new Set(
    assignments.map((a) => `${a.question_id}:${a.judge_id}`)
  );
  const hasAssignments = assignments.length > 0;

  return (
    <div className="max-w-3xl mx-auto">
      {/* ── header ── */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <Link
            to="/upload"
            className="text-xs text-gray-400 hover:text-gray-600 mb-2 inline-block"
          >
            ← Upload
          </Link>
          <h1 className="text-2xl font-semibold break-all">{queueId}</h1>
          {!isLoading && (
            <p className="text-gray-500 text-sm mt-1">
              {submissions.length} submission
              {submissions.length !== 1 ? "s" : ""} &middot; {questions.length}{" "}
              question{questions.length !== 1 ? "s" : ""}
            </p>
          )}
        </div>

        <button
          onClick={() => {
            runMutation.reset();
            runMutation.mutate();
          }}
          disabled={
            runMutation.isPending || questions.length === 0 || !hasAssignments
          }
          title={
            !hasAssignments
              ? "Assign at least one judge to a question first"
              : undefined
          }
          className="ml-4 shrink-0 px-4 py-2 bg-black text-white text-sm rounded hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {runMutation.isPending ? (
            <span className="flex items-center gap-2">
              <Spinner /> Running…
            </span>
          ) : (
            "Run AI Judges"
          )}
        </button>
      </div>

      {/* ── run results ── */}
      {runMutation.isSuccess && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded text-sm">
          <p className="font-medium text-green-800 mb-2">Evaluation complete</p>
          <div className="flex gap-6 text-sm">
            <Stat label="Planned" value={runMutation.data.planned} />
            <Stat label="Completed" value={runMutation.data.completed} color="green" />
            <Stat
              label="Failed"
              value={runMutation.data.failed}
              color={runMutation.data.failed > 0 ? "red" : "green"}
            />
          </div>
          {runMutation.data.failed > 0 && (
            <p className="mt-2 text-xs text-red-600">
              Some evaluations failed. Check edge function logs for details.
            </p>
          )}
        </div>
      )}

      {runMutation.isError && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded text-sm">
          <p className="font-medium text-red-800 mb-1">Evaluation failed</p>
          <p className="text-red-700">{(runMutation.error as Error).message}</p>
          <p className="text-red-500 text-xs mt-1">
            This may be a timeout, quota error, or the edge function may not be
            deployed yet.
          </p>
        </div>
      )}

      {/* ── body ── */}
      {isLoading ? (
        <p className="text-gray-400 text-sm">Loading…</p>
      ) : subsError ? (
        <p className="text-red-500 text-sm">{(subsError as Error).message}</p>
      ) : questions.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-sm">No questions found in this queue.</p>
          <Link to="/upload" className="text-xs text-blue-500 hover:underline mt-1 inline-block">
            Upload submissions
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-medium text-gray-700">
              Assign Judges to Questions
            </h2>
            {judges.length === 0 && (
              <Link
                to="/judges"
                className="text-xs text-amber-600 hover:underline"
              >
                No active judges — create one →
              </Link>
            )}
          </div>

          {questions.map((q) => (
            <QuestionRow
              key={q.data.id}
              question={q}
              judges={judges}
              assignedSet={assignedSet}
              onToggle={(judgeId, assigned) =>
                toggleMutation.mutate({
                  questionId: q.data.id,
                  judgeId,
                  assigned,
                })
              }
              isToggling={toggleMutation.isPending}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── sub-components ───────────────────────────────────────────────────────────

interface QuestionRowProps {
  question: SubmissionQuestion;
  judges: Judge[];
  assignedSet: Set<string>;
  onToggle: (judgeId: string, currentlyAssigned: boolean) => void;
  isToggling: boolean;
}

function QuestionRow({
  question,
  judges,
  assignedSet,
  onToggle,
  isToggling,
}: QuestionRowProps) {
  const { id, questionText, questionType } = question.data;
  return (
    <div className="border border-gray-200 rounded-lg p-4">
      <p className="text-sm font-medium mb-0.5">{questionText}</p>
      <p className="text-xs text-gray-400 font-mono mb-3">
        {id} &middot; {questionType}
      </p>

      {judges.length === 0 ? (
        <p className="text-xs text-gray-400">No active judges available.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {judges.map((judge) => {
            const assigned = assignedSet.has(`${id}:${judge.id}`);
            return (
              <button
                key={judge.id}
                disabled={isToggling}
                onClick={() => onToggle(judge.id, assigned)}
                className={`px-2.5 py-1 text-xs rounded-full border transition-colors disabled:opacity-60 ${
                  assigned
                    ? "bg-black text-white border-black hover:bg-gray-800"
                    : "bg-white text-gray-600 border-gray-300 hover:border-gray-500"
                }`}
              >
                {assigned ? "✓ " : ""}{judge.name}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  color = "gray",
}: {
  label: string;
  value: number;
  color?: "gray" | "green" | "red";
}) {
  const colors = {
    gray: "text-gray-700",
    green: "text-green-700",
    red: "text-red-600",
  };
  return (
    <div>
      <span className="text-gray-500 text-xs">{label} </span>
      <span className={`font-semibold ${colors[color]}`}>{value}</span>
    </div>
  );
}

function Spinner() {
  return (
    <svg
      className="animate-spin h-3.5 w-3.5 text-white"
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
      />
    </svg>
  );
}
