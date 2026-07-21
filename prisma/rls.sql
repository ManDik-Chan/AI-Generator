-- Disaster-recovery baseline. Production releases apply the same controls through
-- versioned Prisma migrations; this file is safe to repeat after a restore.

alter table public.profiles enable row level security;
alter table public.personas enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.memories enable row level security;
alter table public.memory_embeddings enable row level security;
alter table public.generated_images enable row level security;
alter table public.tool_runs enable row level security;
alter table public.tool_assets enable row level security;
alter table public.generation_runs enable row level security;
alter table public.brainstorm_workers enable row level security;
alter table public.agent_runs enable row level security;
alter table public.agent_workers enable row level security;
alter table public.agent_events enable row level security;
alter table public.usage_ledger enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using (id = auth.uid());
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "personas_own_all" on public.personas;
drop policy if exists "personas_select_own" on public.personas;
create policy "personas_select_own" on public.personas
  for select using (user_id = auth.uid());
drop policy if exists "conversations_own_all" on public.conversations;
drop policy if exists "conversations_select_own" on public.conversations;
create policy "conversations_select_own" on public.conversations
  for select using (user_id = auth.uid());

drop policy if exists "memories_select_own" on public.memories;
drop policy if exists "memories_insert_own_relations" on public.memories;
drop policy if exists "memories_update_own_relations" on public.memories;
drop policy if exists "memories_delete_own" on public.memories;
create policy "memories_select_own" on public.memories for select using (user_id = auth.uid());

drop policy if exists "memory_embeddings_select_own" on public.memory_embeddings;
drop policy if exists "memory_embeddings_insert_own_memory" on public.memory_embeddings;
drop policy if exists "memory_embeddings_update_own_memory" on public.memory_embeddings;
drop policy if exists "memory_embeddings_delete_own" on public.memory_embeddings;
create policy "memory_embeddings_select_own" on public.memory_embeddings
  for select using (user_id = auth.uid());

drop policy if exists "generated_images_own_all" on public.generated_images;
drop policy if exists "generated_images_select_own" on public.generated_images;
drop policy if exists "generated_images_insert_own_run" on public.generated_images;
drop policy if exists "generated_images_update_own_run" on public.generated_images;
drop policy if exists "generated_images_delete_own" on public.generated_images;
drop policy if exists "generated_images_insert_own" on public.generated_images;
drop policy if exists "generated_images_update_own" on public.generated_images;
create policy "generated_images_select_own" on public.generated_images
  for select using (user_id = auth.uid());

drop policy if exists "tool_runs_select_own" on public.tool_runs;
drop policy if exists "tool_runs_insert_own" on public.tool_runs;
drop policy if exists "tool_runs_update_own" on public.tool_runs;
drop policy if exists "tool_runs_delete_own" on public.tool_runs;
create policy "tool_runs_select_own" on public.tool_runs
  for select using (user_id = auth.uid());

drop policy if exists "tool_assets_select_own" on public.tool_assets;
drop policy if exists "tool_assets_insert_own_run" on public.tool_assets;
drop policy if exists "tool_assets_update_own_run" on public.tool_assets;
drop policy if exists "tool_assets_delete_own" on public.tool_assets;
create policy "tool_assets_select_own" on public.tool_assets
  for select using (user_id = auth.uid());

drop policy if exists "generation_runs_own_all" on public.generation_runs;
drop policy if exists "generation_runs_select_own" on public.generation_runs;
drop policy if exists "generation_runs_insert_own" on public.generation_runs;
drop policy if exists "generation_runs_update_own" on public.generation_runs;
drop policy if exists "generation_runs_delete_own" on public.generation_runs;
create policy "generation_runs_select_own" on public.generation_runs
  for select using (user_id = auth.uid());

drop policy if exists "brainstorm_workers_select_own" on public.brainstorm_workers;
drop policy if exists "brainstorm_workers_insert_own" on public.brainstorm_workers;
drop policy if exists "brainstorm_workers_update_own" on public.brainstorm_workers;
drop policy if exists "brainstorm_workers_delete_own" on public.brainstorm_workers;
create policy "brainstorm_workers_select_own" on public.brainstorm_workers
  for select using (user_id = auth.uid());

drop policy if exists "agent_runs_select_own" on public.agent_runs;
drop policy if exists "agent_runs_insert_own" on public.agent_runs;
drop policy if exists "agent_runs_update_own" on public.agent_runs;
drop policy if exists "agent_runs_delete_own" on public.agent_runs;
create policy "agent_runs_select_own" on public.agent_runs
  for select using (user_id = auth.uid());

drop policy if exists "agent_workers_select_own" on public.agent_workers;
drop policy if exists "agent_workers_insert_own" on public.agent_workers;
drop policy if exists "agent_workers_update_own" on public.agent_workers;
drop policy if exists "agent_workers_delete_own" on public.agent_workers;
create policy "agent_workers_select_own" on public.agent_workers
  for select using (user_id = auth.uid());

drop policy if exists "agent_events_select_own" on public.agent_events;
drop policy if exists "agent_events_insert_own" on public.agent_events;
drop policy if exists "agent_events_update_own" on public.agent_events;
drop policy if exists "agent_events_delete_own" on public.agent_events;
create policy "agent_events_select_own" on public.agent_events
  for select using (user_id = auth.uid());

drop policy if exists "usage_ledger_select_own" on public.usage_ledger;
create policy "usage_ledger_select_own" on public.usage_ledger
  for select using (user_id = auth.uid());

drop policy if exists "messages_via_conversation" on public.messages;
drop policy if exists "messages_select_via_conversation" on public.messages;
create policy "messages_select_via_conversation" on public.messages
  for select using (
    exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id
        and c.user_id = auth.uid()
    )
  );

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name, role, created_at, updated_at)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(coalesce(new.email, ''), '@', 1)),
    'USER',
    now(),
    now()
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

create or replace function public.protect_profile_system_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('anon', 'authenticated') and (
    new.id is distinct from old.id
    or new.email is distinct from old.email
    or new.role is distinct from old.role
    or new.created_at is distinct from old.created_at
    or new.updated_at is distinct from old.updated_at
  ) then
    raise exception 'profile system fields are server-managed' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_system_fields on public.profiles;
create trigger profiles_protect_system_fields
  before update on public.profiles
  for each row execute function public.protect_profile_system_fields();

revoke all privileges on table public.profiles from public, anon, authenticated;
grant select on table public.profiles to authenticated;
grant update (display_name, avatar_url, memory_enabled) on table public.profiles to authenticated;

revoke all privileges on table public.personas, public.conversations, public.memories
from public, anon, authenticated;
grant select on table public.personas, public.conversations, public.memories
to authenticated;

revoke all privileges on table
  public.messages,
  public.memory_embeddings,
  public.generated_images,
  public.tool_runs,
  public.tool_assets,
  public.generation_runs,
  public.brainstorm_workers,
  public.agent_runs,
  public.agent_workers,
  public.agent_events,
  public.usage_ledger
from public, anon, authenticated;

grant select on table
  public.messages,
  public.memory_embeddings,
  public.generated_images,
  public.tool_runs,
  public.tool_assets,
  public.generation_runs,
  public.brainstorm_workers,
  public.agent_runs,
  public.agent_workers,
  public.agent_events,
  public.usage_ledger
to authenticated;

revoke all privileges on table public.model_configs, public.app_settings
from public, anon, authenticated;
revoke execute on function public.protect_profile_system_fields() from public, anon, authenticated;
revoke execute on function public.handle_new_auth_user() from public, anon, authenticated;
