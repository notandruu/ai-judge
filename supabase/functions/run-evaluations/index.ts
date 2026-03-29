import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface EvalRequest {
  queueId: string;
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
  questions: SubmissionQuestion[];
  answers: Record<string, SubmissionAnswer>;
}

interface Judge {
  id: string;
  name: string;
  system_prompt: string;
  model_name: string;
}

type Verdict = "pass" | "fail" | "inconclusive";

async function callAnthropic(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userMessage: string
): Promise<{ verdict: Verdict; reasoning: string }> {
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
      messages: [{ role: "user", content: userMessage }],
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
  userMessage: string
): Promise<{ verdict: Verdict; reasoning: string }> {
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
        { role: "user", content: userMessage },
      ],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI API error: ${res.status}`);
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
  answer: SubmissionAnswer | undefined
): string {
  return [
    `Question (${question.data.questionType}): ${question.data.questionText}`,
    answer ? `Answer: ${JSON.stringify(answer)}` : "Answer: (no answer provided)",
  ].join("\n\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { queueId } = (await req.json()) as EvalRequest;
    if (!queueId) {
      return new Response(JSON.stringify({ error: "queueId is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const openaiKey = Deno.env.get("OPENAI_API_KEY")!;
    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY")!;

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
      for (const question of raw.questions) {
        const questionId = question.data.id;
        const judges = assignmentsByQuestion.get(questionId);
        if (!judges?.length) continue;

        const answer = raw.answers[questionId];
        const userMessage = buildUserMessage(question, answer);

        for (const judge of judges) {
          planned++;
          try {
            let result: { verdict: Verdict; reasoning: string };

            if (judge.model_name.startsWith("gpt-")) {
              result = await callOpenAI(openaiKey, judge.model_name, judge.system_prompt, userMessage);
            } else if (judge.model_name.startsWith("claude-")) {
              result = await callAnthropic(anthropicKey, judge.model_name, judge.system_prompt, userMessage);
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
            console.error(`Evaluation failed for submission=${submission.id} question=${questionId} judge=${judge.id}:`, err);
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
