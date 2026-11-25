create table queued_messages (
  id uuid primary key default gen_random_uuid(),
  project_id text not null references projects(id) on delete cascade,
  author_id uuid references users(id) on delete set null,
  input jsonb not null,
  created_at timestamptz not null default now()
);
create index queued_messages_project_idx on queued_messages(project_id, created_at);
