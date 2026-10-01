alter table projects add column everyone_access text check (everyone_access in ('view', 'edit'));

create table project_members (
  project_id text not null references projects(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  access text not null check (access in ('view', 'edit')),
  primary key (project_id, user_id)
);
create index project_members_user_idx on project_members(user_id);

alter table messages add column author_id uuid references users(id) on delete set null;
