create table chats (
  id uuid primary key default gen_random_uuid(),
  project_id text not null references projects(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index chats_project_idx on chats(project_id, created_at);
insert into chats (project_id) select id from projects;
alter table messages add column chat_id uuid references chats(id) on delete cascade;
update messages m set chat_id = c.id from chats c where c.project_id = m.project_id;
alter table messages alter column chat_id set not null;
create index messages_chat_idx on messages(chat_id, created_at);
