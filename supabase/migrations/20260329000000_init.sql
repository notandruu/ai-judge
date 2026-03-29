create type verdict_type as enum ('pass', 'fail', 'inconclusive');

create table submissions (
  id text primary key,
  queue_id text not null,
  labeling_task_id text not null,
  created_at timestamptz not null default now(),
  raw_json jsonb not null
);

create table judges (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  system_prompt text not null,
  model_name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table judge_assignments (
  id uuid primary key default gen_random_uuid(),
  question_id text not null,
  judge_id uuid not null references judges(id) on delete cascade,
  queue_id text not null,
  created_at timestamptz not null default now(),
  unique (question_id, judge_id, queue_id)
);

create table evaluations (
  id uuid primary key default gen_random_uuid(),
  submission_id text not null references submissions(id) on delete cascade,
  question_id text not null,
  judge_id uuid not null references judges(id) on delete cascade,
  verdict verdict_type not null,
  reasoning text not null,
  created_at timestamptz not null default now()
);

create index idx_submissions_queue on submissions(queue_id);
create index idx_judge_assignments_queue on judge_assignments(queue_id);
create index idx_evaluations_submission on evaluations(submission_id);
create index idx_evaluations_judge on evaluations(judge_id);
