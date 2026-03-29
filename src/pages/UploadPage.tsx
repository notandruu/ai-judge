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
  submissionIds: string[];
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
  const submissionIds = items.map((i) => i.id);
  return { count: items.length, queueIds, submissionIds };
}

function getMediaType(file: File): string {
  if (file.type) return file.type;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const types: Record<string, string> = {
    wav: "audio/wav",
    mp3: "audio/mpeg",
    mp4: "video/mp4",
    pdf: "application/pdf",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
  };
  return types[ext] ?? "application/octet-stream";
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
          <ul className="space-y-1 mb-5">
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

          <div className="border-t border-green-200 pt-4">
            <AttachmentUploader submissionIds={mutation.data.submissionIds} />
          </div>
        </div>
      )}
    </div>
  );
}

// ── AttachmentUploader ───────────────────────────────────────────────────────

interface AttachedFile {
  name: string;
  submissionId: string;
}

interface AttachmentUploaderProps {
  submissionIds: string[];
}

function AttachmentUploader({ submissionIds }: AttachmentUploaderProps) {
  const attachFileRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedSubmissionId, setSelectedSubmissionId] = useState(
    submissionIds[0] ?? ""
  );
  const [attached, setAttached] = useState<AttachedFile[]>([]);

  const attachMutation = useMutation({
    mutationFn: async ({
      file,
      submissionId,
    }: {
      file: File;
      submissionId: string;
    }): Promise<AttachedFile> => {
      const mediaType = getMediaType(file);
      const safeName = file.name
        .replace(/\s+/g, "_")
        .replace(/[^a-zA-Z0-9._-]/g, "");
      const path = `${submissionId}/${Date.now()}-${safeName}`;

      const { error: storageErr } = await supabase.storage
        .from("attachments")
        .upload(path, file, { contentType: mediaType });
      if (storageErr) throw new Error(storageErr.message);

      const {
        data: { publicUrl },
      } = supabase.storage.from("attachments").getPublicUrl(path);

      const { error: dbErr } = await supabase.from("attachments").insert({
        submission_id: submissionId,
        file_name: safeName,
        file_url: publicUrl,
        media_type: mediaType,
      });
      if (dbErr) throw new Error(dbErr.message);

      return { name: file.name, submissionId };
    },
    onSuccess: (result) => {
      setAttached((prev) => [...prev, result]);
      setSelectedFile(null);
      if (attachFileRef.current) attachFileRef.current.value = "";
    },
  });

  if (submissionIds.length === 0) return null;

  return (
    <div>
      <h3 className="text-sm font-medium text-gray-700 mb-1">
        Attach Media Files
      </h3>
      <p className="text-xs text-gray-500 mb-3">
        Associate audio, image, or document files with specific submissions.
        Vision-capable judges will receive images as context.
        <br />
        Supported: .wav, .mp3, .mp4, .pdf, .png, .jpg
      </p>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <label className="cursor-pointer">
          <input
            ref={attachFileRef}
            type="file"
            accept=".wav,.mp3,.mp4,.pdf,.png,.jpg,.jpeg"
            className="hidden"
            onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
          />
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-300 rounded hover:border-gray-400 text-gray-600 transition-colors cursor-pointer">
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
            </svg>
            {selectedFile ? selectedFile.name : "Choose file"}
          </span>
        </label>

        <select
          value={selectedSubmissionId}
          onChange={(e) => setSelectedSubmissionId(e.target.value)}
          className="px-2 py-1.5 text-xs border border-gray-300 rounded text-gray-600 max-w-[200px] truncate"
        >
          {submissionIds.map((id) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </select>

        <button
          type="button"
          disabled={!selectedFile || !selectedSubmissionId || attachMutation.isPending}
          onClick={() => {
            if (selectedFile && selectedSubmissionId) {
              attachMutation.mutate({ file: selectedFile, submissionId: selectedSubmissionId });
            }
          }}
          className="px-3 py-1.5 text-xs text-white rounded disabled:opacity-40"
          style={{ backgroundColor: "#D4522A" }}
        >
          {attachMutation.isPending ? "Attaching…" : "Attach"}
        </button>
      </div>

      {attachMutation.isError && (
        <p className="text-red-600 text-xs mb-2">
          {(attachMutation.error as Error).message}
        </p>
      )}

      {attached.length > 0 && (
        <ul className="space-y-1">
          {attached.map((att, i) => (
            <li key={i} className="flex items-center gap-1.5 text-xs text-green-700">
              <svg
                width="11"
                height="11"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
              </svg>
              {att.name}
              <span className="text-green-500">→</span>
              <span className="font-mono">{att.submissionId}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
