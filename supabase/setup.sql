-- TaxKeep cloud backup: run once in Supabase → SQL Editor → New query → Run.
-- Each person can only read and write their own backup and their own files.

create table if not exists public.backups (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  state      jsonb not null default '{}'::jsonb,   -- answers, income, slips, settings
  receipts   jsonb not null default '[]'::jsonb,   -- receipt details (photos are in Storage)
  files      jsonb not null default '{}'::jsonb,   -- which photos are uploaded
  device     text,
  app_version text,
  updated_at timestamptz not null default now()
);

alter table public.backups enable row level security;

drop policy if exists "own backup - read"   on public.backups;
drop policy if exists "own backup - insert" on public.backups;
drop policy if exists "own backup - update" on public.backups;
drop policy if exists "own backup - delete" on public.backups;
create policy "own backup - read"   on public.backups for select to authenticated using (auth.uid() = user_id);
create policy "own backup - insert" on public.backups for insert to authenticated with check (auth.uid() = user_id);
create policy "own backup - update" on public.backups for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own backup - delete" on public.backups for delete to authenticated using (auth.uid() = user_id);

-- Private bucket for receipt and slip photos. Files live under <user id>/...
insert into storage.buckets (id, name, public, file_size_limit)
values ('vault', 'vault', false, 10485760)
on conflict (id) do update set public = false, file_size_limit = 10485760;

drop policy if exists "vault - own files read"   on storage.objects;
drop policy if exists "vault - own files insert" on storage.objects;
drop policy if exists "vault - own files update" on storage.objects;
drop policy if exists "vault - own files delete" on storage.objects;
create policy "vault - own files read"   on storage.objects for select to authenticated using (bucket_id = 'vault' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "vault - own files insert" on storage.objects for insert to authenticated with check (bucket_id = 'vault' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "vault - own files update" on storage.objects for update to authenticated using (bucket_id = 'vault' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "vault - own files delete" on storage.objects for delete to authenticated using (bucket_id = 'vault' and (storage.foldername(name))[1] = auth.uid()::text);

-- Lets a signed-in person delete their own account (the app removes their photos first through Storage).
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  delete from auth.users where id = auth.uid();
end; $$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
