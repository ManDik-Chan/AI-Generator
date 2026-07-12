-- Apply after `pnpm db:deploy`. Prisma connects on the trusted server; these
-- policies protect direct Supabase client access as a second authorization layer.

alter table public.profiles enable row level security;
alter table public.personas enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.memories enable row level security;
alter table public.generated_images enable row level security;

create policy "profiles_select_own" on public.profiles
  for select using (id = auth.uid());
create policy "profiles_update_own" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

create policy "personas_own_all" on public.personas
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "conversations_own_all" on public.conversations
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "memories_select_own" on public.memories for select using (user_id = auth.uid());
create policy "memories_insert_own_relations" on public.memories for insert with check (user_id = auth.uid() and (persona_id is null or exists (select 1 from public.personas p where p.id = persona_id and p.user_id = auth.uid())) and (source_conversation_id is null or exists (select 1 from public.conversations c where c.id = source_conversation_id and c.user_id = auth.uid())) and (source_message_id is null or exists (select 1 from public.messages m join public.conversations c on c.id = m.conversation_id where m.id = source_message_id and c.user_id = auth.uid() and (source_conversation_id is null or m.conversation_id = source_conversation_id))));
create policy "memories_update_own_relations" on public.memories for update using (user_id = auth.uid()) with check (user_id = auth.uid() and (persona_id is null or exists (select 1 from public.personas p where p.id = persona_id and p.user_id = auth.uid())) and (source_conversation_id is null or exists (select 1 from public.conversations c where c.id = source_conversation_id and c.user_id = auth.uid())) and (source_message_id is null or exists (select 1 from public.messages m join public.conversations c on c.id = m.conversation_id where m.id = source_message_id and c.user_id = auth.uid() and (source_conversation_id is null or m.conversation_id = source_conversation_id))));
create policy "memories_delete_own" on public.memories for delete using (user_id = auth.uid());
create policy "generated_images_own_all" on public.generated_images
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "messages_via_conversation" on public.messages
  for all using (
    exists (
      select 1 from public.conversations
      where conversations.id = messages.conversation_id
        and conversations.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.conversations
      where conversations.id = messages.conversation_id
        and conversations.user_id = auth.uid()
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
  for each row execute procedure public.handle_new_auth_user();
