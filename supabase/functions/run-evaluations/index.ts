import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface FieldConfig {
  questionText: boolean;
  answerChoice: boolean;
  answerReasoning: boolean;
  metadata: boolean;
}

const DEFAULT_FIELD_CONFIG: FieldConfig = {
  questionText: true,
  answerChoice: true,
  answerReasoning: true,
  metadata: false,
};

interface EvalRequest {
  queueId: string;
  fieldConfig?: Partial<FieldConfig>;
}

interface SubmissionQuestion {
  rev: number;
  data: { id: string; questionType: string; questionText: string };
}

interface SubmissionAnswer {
  choice?: string;
  reasoning?: string;
  [key: string]: unknown;
}

interface SubmissionJson {
  id: string;
  queueId: string;
  labelingTaskId: string;
  createdAt: number;
  questions: SubmissionQuestion[];
  answers: Record<string, SubmissionAnswer>;
  [key: string]: unknown;
}

interface Judge {
  id: string;
  name: string;
  system_prompt: string;
  model_name: string;
}

interface Attachment {
  file_name: string;
  file_url: string;
  media_type: string;
}

type Verdict = "pass" | "fail" | "inconclusive";

const CORE_FIELDS = new Set([
  "id", "queueId", "labelingTaskId", "createdAt", "questions", "answers",
]);

function isVisionModel(model: string): boolean {
  return model.startsWith("claude-") || model === "gpt-4o" || model === "gpt-4o-mini";
}

function isImageFile(filename: string): boolean {
  return /\.(png|jpg|jpeg|gif|webp)$/i.test(filename);
}

function isAudioFile(filename: string): boolean {
  return /\.(wav|mp3)$/i.test(filename);
}

async function callAnthropic(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userText: string,
  imageUrls: string[] = []
): Promise<{ verdict: Verdict; reasoning: string }> {
  let messageContent: unknown;
  if (imageUrls.length > 0) {
    const blocks: unknown[] = imageUrls.map((url) => ({
      type: "image",
      source: { type: "url", url },
    }));
    blocks.push({ type: "text", text: userText });
    messageContent = blocks;
  } else {
    messageContent = userText;
  }

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: "user", content: messageContent }],
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    console.error("Anthropic error body:", text);
    throw new Error(`Anthropic API error: ${res.status} - ${text}`);
  }
  const data = await res.json();
  const text: string = data.content?.[0]?.text ?? "";
  return parseVerdictResponse(text);
}

async function callOpenAI(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userText: string,
  imageUrls: string[] = []
): Promise<{ verdict: Verdict; reasoning: string }> {
  let userContent: unknown;
  if (imageUrls.length > 0) {
    const blocks: unknown[] = imageUrls.map((url) => ({
      type: "image_url",
      image_url: { url },
    }));
    blocks.push({ type: "text", text: userText });
    userContent = blocks;
  } else {
    userContent = userText;
  }

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    console.error("OpenAI error body:", text);
    throw new Error(`OpenAI API error: ${res.status} - ${text}`);
  }
  const data = await res.json();
  const text: string = data.choices?.[0]?.message?.content ?? "";
  return parseVerdictResponse(text);
}

function parseVerdictResponse(text: string): { verdict: Verdict; reasoning: string } {
  const lower = text.toLowerCase();
  let verdict: Verdict = "inconclusive";
  if (lower.includes("pass")) verdict = "pass";
  else if (lower.includes("fail")) verdict = "fail";
  return { verdict, reasoning: text.trim() };
}

function buildUserMessage(
  question: SubmissionQuestion,
  answer: SubmissionAnswer | undefined,
  fieldConfig: FieldConfig,
  metadataFields: Record<string, unknown>,
  attachments: Attachment[]
): string {
  const parts: string[] = [];

  if (fieldConfig.questionText) {
    parts.push(`Question (${question.data.questionType}): ${question.data.questionText}`);
  }

  if (answer) {
    if (fieldConfig.answerChoice && answer.choice !== undefined) {
      parts.push(`Answer Choice: ${answer.choice}`);
    }
    if (fieldConfig.answerReasoning && answer.reasoning !== undefined) {
      parts.push(`Answer Reasoning: ${answer.reasoning}`);
    }
  }

  if (fieldConfig.metadata && Object.keys(metadataFields).length > 0) {
    parts.push(`Metadata: ${JSON.stringify(metadataFields, null, 2)}`);
  }

  for (const att of attachments) {
    if (isAudioFile(att.file_name)) {
      parts.push(
        `Audio file attached: ${att.file_name}. Evaluate based on the transcription/answer provided.`
      );
    } else if (!isImageFile(att.file_name)) {
      parts.push(`File attached: ${att.file_name}.`);
    }
  }

  return parts.join("\n\n") || "(no content selected)";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = (await req.json()) as EvalRequest;
    const { queueId } = body;
    const fieldConfig: FieldConfig = {
      ...DEFAULT_FIELD_CONFIG,
      ...(body.fieldConfig ?? {}),
    };

    if (!queueId) {
      return new Response(JSON.stringify({ error: "queueId is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const openaiKey = Deno.env.get("OPENAI_API_KEY") ?? "";
    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY") ?? "";

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: submissions, error: subErr } = await supabase
      .from("submissions")
      .select("*")
      .eq("queue_id", queueId);
    if (subErr) throw subErr;

    const { data: assignments, error: assignErr } = await supabase
      .from("judge_assignments")
      .select("*, judges(*)")
      .eq("queue_id", queueId);
    if (assignErr) throw assignErr;

    const submissionIds = (submissions ?? []).map((s) => s.id);
    const { data: attachmentsData } = submissionIds.length > 0
      ? await supabase.from("attachments").select("*").in("submission_id", submissionIds)
      : { data: [] };

    const attachmentsBySubmission = new Map<string, Attachment[]>();
    for (const att of attachmentsData ?? []) {
      const list = attachmentsBySubmission.get(att.submission_id) ?? [];
      list.push(att as Attachment);
      attachmentsBySubmission.set(att.submission_id, list);
    }

    const assignmentsByQuestion = new Map<string, Judge[]>();
    for (const a of assignments ?? []) {
      const judge = a.judges as unknown as Judge;
      if (!judge) continue;
      const existing = assignmentsByQuestion.get(a.question_id) ?? [];
      existing.push(judge);
      assignmentsByQuestion.set(a.question_id, existing);
    }

    let planned = 0;
    let completed = 0;
    let failed = 0;

    for (const submission of submissions ?? []) {
      const raw = submission.raw_json as SubmissionJson;
      const attachments = attachmentsBySubmission.get(submission.id) ?? [];

      const metadataFields: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(raw)) {
        if (!CORE_FIELDS.has(key)) metadataFields[key] = val;
      }

      for (const question of raw.questions) {
        const questionId = question.data.id;
        const judges = assignmentsByQuestion.get(questionId);
        if (!judges?.length) continue;

        const answer = raw.answers[questionId];
        const audioAttachments = attachments.filter((a) => isAudioFile(a.file_name));
        const imageAttachments = attachments.filter((a) => isImageFile(a.file_name));
        const userText = buildUserMessage(question, answer, fieldConfig, metadataFields, [
          ...audioAttachments,
          ...attachments.filter((a) => !isAudioFile(a.file_name) && !isImageFile(a.file_name)),
        ]);

        for (const judge of judges) {
          planned++;
          try {
            const imageUrls = isVisionModel(judge.model_name)
              ? imageAttachments.map((a) => a.file_url)
              : [];

            let result: { verdict: Verdict; reasoning: string };
            if (judge.model_name.startsWith("gpt-")) {
              result = await callOpenAI(openaiKey, judge.model_name, judge.system_prompt, userText, imageUrls);
            } else if (judge.model_name.startsWith("claude-")) {
              result = await callAnthropic(anthropicKey, judge.model_name, judge.system_prompt, userText, imageUrls);
            } else {
              throw new Error(`Unsupported model prefix: ${judge.model_name}`);
            }

            const { error: insertErr } = await supabase.from("evaluations").insert({
              submission_id: submission.id,
              question_id: questionId,
              judge_id: judge.id,
              verdict: result.verdict,
              reasoning: result.reasoning,
            });
            if (insertErr) throw insertErr;

            completed++;
          } catch (err) {
            console.error(
              `Evaluation failed for submission=${submission.id} question=${questionId} judge=${judge.id}:`,
              err
            );
            failed++;
          }
        }
      }
    }

    return new Response(
      JSON.stringify({ planned, completed, failed }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("run-evaluations error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
