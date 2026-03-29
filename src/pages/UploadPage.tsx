import { useState, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import type { SubmissionJson } from "../types/db";

function validateSubmissions(data: unknown): SubmissionJson[] {
  if (!Array.isArray(data)) throw new Error("Expected a JSON array at the root");
  return data.map((item: unknown, i: number) => {
    if (typeof item !== "object" || item === null) {
      throw new Error(`Item ${i}: not an object`);
    }
    const s = item as Record<string, unknown>;
    if (typeof s.id !== "string") throw new Error(`Item ${i}: missing or invalid "id"`);
    if (typeof s.queueId !== "string") throw new Error(`Item ${i}: missing or invalid "queueId"`);
    if (typeof s.labelingTaskId !== "string")
      throw new Error(`Item ${i}: missing or invalid "labelingTaskId"`);
    if (!Array.isArray(s.questions))
      throw new Error(`Item ${i}: "questions" must be an array`);
    if (typeof s.answers !== "object" || s.answers === null)
      throw new Error(`Item ${i}: "answers" must be an object`);
    return item as SubmissionJson;
  });
}

interface UploadResult {
  count: number;
  queueIds: string[];
}

async function insertSubmissions(items: SubmissionJson[]): Promise<UploadResult> {
  const rows = items.map((item) => ({
    id: item.id,
    queue_id: item.queueId,
    labeling_task_id: item.labelingTaskId,
    created_at: new Date(item.createdAt).toISOString(),
    raw_json: item,
  }));

  const { error } = await supabase
    .from("submissions")
    .upsert(rows, { onConflict: "id" });
  if (error) throw new Error(error.message);

  const queueIds = [...new Set(items.map((i) => i.queueId))];
  return { count: items.length, queueIds };
}

export default function UploadPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  const mutation = useMutation({ mutationFn: insertSubmissions });

  function handleFile(file: File) {
    setParseError(null);
    mutation.reset();
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const raw: unknown = JSON.parse(e.target?.result as string);
        const submissions = validateSubmissions(raw);
        mutation.mutate(submissions);
      } catch (err) {
        setParseError((err as Error).message);
      }
    };
    reader.readAsText(file);
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = "";
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  return (
    <div className="max-w-xl mx-auto mt-10">
      <h1 className="text-2xl font-semibold mb-1">Upload Submissions</h1>
      <p className="text-gray-500 text-sm mb-6">
        Upload a JSON array of submission objects.
      </p>

      <div
        className={`border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-colors ${
          dragging
            ? "border-blue-400 bg-blue-50"
            : "border-gray-300 hover:border-gray-400"
        }`}
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={onFileChange}
        />
        <svg
          className="mx-auto mb-3 text-gray-300"
          width="40"
          height="40"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
        </svg>
        <p className="text-gray-500 text-sm font-medium">
          {dragging ? "Drop to upload" : "Click or drag a JSON file here"}
        </p>
        <p className="text-gray-400 text-xs mt-1">JSON array of submission objects</p>
      </div>

      {parseError && (
        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
          <strong>Invalid file:</strong> {parseError}
        </div>
      )}

      {mutation.isError && (
        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
          <strong>Upload failed:</strong> {(mutation.error as Error).message}
        </div>
      )}

      {mutation.isPending && (
        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded text-sm text-blue-700">
          Uploading…
        </div>
      )}

      {mutation.isSuccess && (
        <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded">
          <p className="text-green-800 text-sm font-medium">
            {mutation.data.count} submission
            {mutation.data.count !== 1 ? "s" : ""} uploaded successfully.
          </p>
          <p className="text-green-700 text-xs mt-3 mb-1 font-medium">Queues found:</p>
          <ul className="space-y-1">
            {mutation.data.queueIds.map((qid) => (
              <li key={qid}>
                <Link
                  to={`/queue/${encodeURIComponent(qid)}`}
                  className="text-blue-600 hover:underline text-sm"
                >
                  {qid} →
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
