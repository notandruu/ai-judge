create table attachments (
  id uuid primary key default gen_random_uuid(),
  submission_id text not null references submissions(id) on delete cascade,
  file_name text not null,
  file_url text not null,
  media_type text not null,
  created_at timestamptz not null default now()
);

create index idx_attachments_submission on attachments(submission_id);
