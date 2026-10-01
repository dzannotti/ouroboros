alter table users add column role text not null default 'user' check (role in ('admin', 'user'));

create table sessions (
  id text primary key,
  user_id uuid not null references users(id) on delete cascade,
  id_token text,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index sessions_expires_idx on sessions(expires_at);
