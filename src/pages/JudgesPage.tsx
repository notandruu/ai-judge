import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import type { Judge } from "../types/db";

const MODELS = [
  "claude-sonnet-4-5",
  "claude-opus-4-5",
  "claude-haiku-4-5-20251001",
  "gpt-4o",
  "gpt-4o-mini",
] as const;

interface JudgeFormValues {
  name: string;
  system_prompt: string;
  model_name: string;
  active: boolean;
}

const defaultForm: JudgeFormValues = {
  name: "",
  system_prompt: "",
  model_name: "claude-sonnet-4-5",
  active: true,
};

async function fetchJudges(): Promise<Judge[]> {
  const { data, error } = await supabase
    .from("judges")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export default function JudgesPage() {
  const qc = useQueryClient();
  const { data: judges = [], isLoading } = useQuery({
    queryKey: ["judges"],
    queryFn: fetchJudges,
  });

  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<JudgeFormValues>(defaultForm);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const invalidateJudges = () => qc.invalidateQueries({ queryKey: ["judges"] });

  const createMutation = useMutation({
    mutationFn: async (values: JudgeFormValues) => {
      const { error } = await supabase.from("judges").insert(values);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      invalidateJudges();
      setShowCreate(false);
      setForm(defaultForm);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({
      id,
      values,
    }: {
      id: string;
      values: Partial<JudgeFormValues>;
    }) => {
      const { error } = await supabase.from("judges").update(values).eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      invalidateJudges();
      setEditingId(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("judges").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      invalidateJudges();
      setDeleteConfirmId(null);
    },
  });

  function startEdit(judge: Judge) {
    setEditingId(judge.id);
    setShowCreate(false);
    setForm({
      name: judge.name,
      system_prompt: judge.system_prompt,
      model_name: judge.model_name,
      active: judge.active,
    });
  }

  function openCreate() {
    setEditingId(null);
    setShowCreate(true);
    setForm(defaultForm);
  }

  function onFormChange(key: keyof JudgeFormValues, value: string | boolean) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function submitCreate(e: React.FormEvent) {
    e.preventDefault();
    createMutation.mutate(form);
  }

  function submitEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingId) return;
    updateMutation.mutate({ id: editingId, values: form });
  }

  const formError = (createMutation.error ?? updateMutation.error)?.message;

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Judges</h1>
        <button
          onClick={openCreate}
          className="px-3 py-1.5 text-white text-sm rounded"
          style={{ backgroundColor: "#D4522A" }}
        >
          + New Judge
        </button>
      </div>

      {(showCreate || editingId !== null) && (
        <JudgeForm
          title={editingId ? "Edit Judge" : "New Judge"}
          form={form}
          onChange={onFormChange}
          onSubmit={editingId ? submitEdit : submitCreate}
          onCancel={() => {
            setShowCreate(false);
            setEditingId(null);
          }}
          isSubmitting={createMutation.isPending || updateMutation.isPending}
          error={formError}
        />
      )}

      {isLoading ? (
        <p className="text-gray-400 text-sm">Loading…</p>
      ) : judges.length === 0 ? (
        <p className="text-gray-400 text-sm">
          No judges yet. Create one above.
        </p>
      ) : (
        <ul className="divide-y divide-gray-100 border border-gray-200 rounded-lg">
          {judges.map((judge) => (
            <li key={judge.id} className="p-4 flex items-start gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center flex-wrap gap-2 mb-1">
                  <span className="font-medium text-sm">{judge.name}</span>
                  <span className="text-xs text-gray-400 font-mono bg-gray-50 px-1.5 py-0.5 rounded">
                    {judge.model_name}
                  </span>
                  <span
                    className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                      judge.active
                        ? "bg-green-100 text-green-700"
                        : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {judge.active ? "active" : "inactive"}
                  </span>
                </div>
                <p className="text-xs text-gray-500 line-clamp-2 whitespace-pre-wrap">
                  {judge.system_prompt}
                </p>
              </div>

              <div className="flex items-center gap-3 shrink-0 text-xs">
                <button
                  onClick={() =>
                    updateMutation.mutate({
                      id: judge.id,
                      values: { active: !judge.active },
                    })
                  }
                  className="text-gray-500 hover:text-gray-700 underline"
                >
                  {judge.active ? "Deactivate" : "Activate"}
                </button>
                <button
                  onClick={() => startEdit(judge)}
                  className="text-blue-600 hover:underline"
                >
                  Edit
                </button>
                {deleteConfirmId === judge.id ? (
                  <>
                    <button
                      onClick={() => deleteMutation.mutate(judge.id)}
                      disabled={deleteMutation.isPending}
                      className="text-red-600 hover:underline disabled:opacity-50"
                    >
                      Confirm delete
                    </button>
                    <button
                      onClick={() => setDeleteConfirmId(null)}
                      className="text-gray-400 hover:underline"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => setDeleteConfirmId(judge.id)}
                    className="text-red-500 hover:underline"
                  >
                    Delete
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface JudgeFormProps {
  title: string;
  form: JudgeFormValues;
  onChange: (key: keyof JudgeFormValues, value: string | boolean) => void;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
  isSubmitting: boolean;
  error?: string;
}

function JudgeForm({
  title,
  form,
  onChange,
  onSubmit,
  onCancel,
  isSubmitting,
  error,
}: JudgeFormProps) {
  return (
    <form
      onSubmit={onSubmit}
      className="mb-6 p-4 border border-gray-200 rounded-lg bg-gray-50"
    >
      <h2 className="text-base font-medium mb-4">{title}</h2>
      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Name
          </label>
          <input
            required
            value={form.name}
            onChange={(e) => onChange("name", e.target.value)}
            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
            placeholder="e.g. Quality Checker"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            System Prompt
          </label>
          <textarea
            required
            rows={5}
            value={form.system_prompt}
            onChange={(e) => onChange("system_prompt", e.target.value)}
            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm font-mono resize-y"
            placeholder={
              "You are an AI judge evaluating answers.\n\nRespond with:\nVerdict: pass | fail | inconclusive\nReason: <one sentence>"
            }
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Model
          </label>
          <select
            value={form.model_name}
            onChange={(e) => onChange("model_name", e.target.value)}
            className="border border-gray-300 rounded px-2 py-1.5 text-sm"
          >
            {MODELS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="judge-active"
            checked={form.active}
            onChange={(e) => onChange("active", e.target.checked)}
            className="rounded"
          />
          <label htmlFor="judge-active" className="text-sm text-gray-700">
            Active
          </label>
        </div>
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <div className="flex gap-2 mt-4">
        <button
          type="submit"
          disabled={isSubmitting}
          className="px-3 py-1.5 text-white text-sm rounded disabled:opacity-50"
          style={{ backgroundColor: "#D4522A" }}
        >
          {isSubmitting ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
