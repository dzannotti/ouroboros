create table connections (
  user_id uuid not null references users(id) on delete cascade,
  provider text not null check (provider in ('vercel', 'supabase')),
  token text not null,
  refresh_token text,
  expires_at timestamptz,
  team_id text,
  account text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, provider)
);

create table deployments (
  project_id text primary key references projects(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  vercel_project_id text,
  url text,
  supabase_ref text,
  supabase_db_pass text,
  data_copied boolean not null default false,
  sha text,
  status text not null default 'idle' check (status in ('idle', 'running', 'ready', 'error')),
  step text,
  error text,
  deployed_at timestamptz,
  updated_at timestamptz not null default now()
);
