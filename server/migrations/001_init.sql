create table users (
  id uuid primary key default gen_random_uuid(),
  subject text unique not null,
  name text not null,
  email text,
  created_at timestamptz not null default now()
);

create table projects (
  id text primary key,
  owner_id uuid not null references users(id) on delete cascade,
  name text not null,
  model text not null,
  last_good_commit text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index projects_owner_idx on projects(owner_id, updated_at desc);

create table messages (
  id uuid primary key default gen_random_uuid(),
  project_id text not null references projects(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  parts jsonb not null default '[]',
  transcript jsonb not null default '[]',
  mode text not null default 'build',
  status text not null default 'done' check (status in ('streaming', 'done', 'error', 'stopped')),
  commit_sha text,
  created_at timestamptz not null default now()
);
create index messages_project_idx on messages(project_id, created_at);

create table secrets (
  project_id text not null references projects(id) on delete cascade,
  name text not null,
  value text not null,
  created_at timestamptz not null default now(),
  primary key (project_id, name)
);
