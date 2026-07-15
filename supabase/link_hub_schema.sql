create extension if not exists pgcrypto;

create table if not exists public.link_hub_projects (
  id uuid primary key default gen_random_uuid(),
  notion_page_id text not null unique,
  project_name text not null default '',
  infopack_link text,
  google_form_link text,
  project_country text,
  show_on_links boolean not null default false,
  call_deadline date,
  sort_order integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists link_hub_projects_visible_idx
  on public.link_hub_projects (show_on_links, call_deadline, sort_order);

create or replace function public.set_link_hub_projects_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_link_hub_projects_updated_at
  on public.link_hub_projects;

create trigger set_link_hub_projects_updated_at
before update on public.link_hub_projects
for each row
execute function public.set_link_hub_projects_updated_at();

alter table public.link_hub_projects enable row level security;

drop policy if exists "Public can read visible link hub projects"
  on public.link_hub_projects;

create policy "Public can read visible link hub projects"
  on public.link_hub_projects
  for select
  to anon, authenticated
  using (
    show_on_links = true
    and (
      call_deadline is null
      or call_deadline >= ((now() at time zone 'Europe/Belgrade')::date)
    )
  );

grant usage on schema public to anon, authenticated;
grant select on public.link_hub_projects to anon, authenticated;
