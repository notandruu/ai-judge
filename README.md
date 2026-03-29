# AI Judge

## Overview

AI Judge is an internal annotation review tool that runs LLM-based evaluations against human-labeled submission queues. Users upload a JSON batch of submissions, define AI judges with custom rubrics and model assignments, assign judges to questions within a queue, and trigger evaluations that persist pass/fail/inconclusive verdicts to Postgres. Results are browsable with per-judge pass-rate charts and multi-axis filters. Stack: React 19 + TypeScript + Vite, Tailwind CSS v4, Supabase (Postgres + Storage + Edge Functions), React Query, Recharts.

## Features

**Core**
- `/upload` — drag-and-drop JSON ingestion, upserts submissions to Postgres
- `/judges` — full CRUD for AI judges: name, system prompt, model, active toggle
- `/queue/:queueId` — assign judges to individual questions, then run all evaluations in one click
- `/results` — filterable table of every evaluation with pass-rate stats and an animated per-judge bar chart

**Bonus: Prompt Field Selector**
A collapsible "Prompt Configuration" panel on the queue page lets users toggle which fields are included in the LLM prompt: question text, answer choice, answer reasoning, and submission metadata (any extra fields in `raw_json` beyond the core schema). Selections are persisted in `localStorage` and sent to the edge function on each run so the LLM only sees what is relevant.

**Bonus: Media File Attachments**
After uploading a JSON batch, users can attach `.wav`, `.mp3`, `.mp4`, `.pdf`, `.png`, or `.jpg` files to specific submissions. Files are stored in a Supabase Storage public bucket (`attachments`) and metadata is recorded in a dedicated `attachments` table. On the queue page, submissions with attachments show a paperclip indicator. When evaluations run, image attachments are passed as vision content blocks to capable models (`claude-*`, `gpt-4o`). Audio attachments inject a text note — "Audio file attached: [name]. Evaluate based on the transcription/answer provided." — since full Whisper transcription is out of scope.

**Bonus: Dataset Quality Report Export**
The results page includes an "Export for Customer Delivery" bar with two actions: "Export CSV" downloads all visible (filter-respecting) evaluations as a CSV with columns `submission_id`, `question_id`, `judge_name`, `verdict`, `reasoning`, `created_at`. "Copy Summary" copies a markdown-formatted QA report to the clipboard with overall pass rate, per-verdict counts, and a per-judge breakdown table — ready to paste into Notion, Slack, or a customer delivery doc.

## Architecture Decisions

**Supabase Edge Functions for LLM calls.** API keys for OpenAI and Anthropic never touch the browser — they live as server-side secrets and are only read inside the Deno runtime. The function also centralizes routing logic (model prefix → provider) and error handling in one place, and scales to zero when idle.

**React Query for all server state.** Cache invalidation after mutations is a one-liner (`invalidateQueries`), which means the UI always reflects the database without manual refetch wiring. It also gives loading/error/success states for free, avoiding a pile of `useState` flags.

**Verdict as a Postgres enum, not a string.** The `verdict_type` enum (`pass`, `fail`, `inconclusive`) enforces valid values at the database layer rather than relying on application-level validation. It also makes filter queries and aggregate stats cheaper because Postgres can use enum comparison rather than string matching.

## Running Locally

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Fill in VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, ANTHROPIC_API_KEY, OPENAI_API_KEY

# 3. Push the database schema (includes attachments table)
npx supabase db push

# 4. Deploy the edge function
# First add SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY
# to Supabase Dashboard → Project Settings → Edge Functions → Secrets
npx supabase functions deploy run-evaluations --no-verify-jwt

# 5. Create a public Supabase Storage bucket named "attachments"
# Dashboard → Storage → New bucket → name: attachments → Public: on

# 5. Start the dev server
npm run dev
```

## Trade-offs and Scope Cuts

RLS is disabled across all tables. In production, row-level security policies would be tied to a Supabase Auth user ID so each team sees only its own data. There is no auth layer at all currently — the anon key has unrestricted table access, which is acceptable for an internal demo but not for multi-tenant use.

Verdict parsing is regex-based: the edge function scans the raw LLM response text for the words "pass" or "fail". In production this would be replaced with structured outputs (Anthropic tool use or OpenAI response format) to guarantee a typed schema and eliminate false parses on responses that mention both words in reasoning.

The edge function has no retry logic. Transient quota errors or network timeouts increment the `failed` counter and move on. Production would add exponential backoff with jitter per (submission × judge) pair. Similarly, there is no streaming — the entire evaluation batch runs synchronously and the client polls a single response. SSE or Supabase Realtime would make progress visible in real time for large queues.

## Time Spent

Approximately 4 hours, including debugging Supabase RLS permissions, JWT auth failures on the edge function, and Anthropic model name mismatches (`claude-sonnet-4-6` is not a valid model ID).

## If I Had More Time

Structured outputs for verdict parsing would be the highest-leverage fix — the current regex is fragile. After that: Supabase Auth with RLS policies, exponential backoff on LLM failures, streaming progress via SSE, and Gemini provider support (the edge function's model-prefix router already makes adding a third provider straightforward).
