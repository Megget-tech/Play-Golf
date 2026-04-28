-- Unique constraint on external_id so upsert works
alter table public.courses add constraint courses_external_id_unique unique (external_id);

-- Add golf_id and avatar_url to profiles
alter table public.profiles add column if not exists golf_id text;
alter table public.profiles add column if not exists avatar_url text;

-- Storage bucket for avatars
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- Storage policy
create policy "Anyone can view avatars"
  on storage.objects for select using (bucket_id = 'avatars');

create policy "Users can upload own avatar"
  on storage.objects for insert with check (
    bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Users can update own avatar"
  on storage.objects for update using (
    bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]
  );
