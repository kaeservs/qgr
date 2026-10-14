-- A teammate's profile photo: a small square JPEG, made in the browser and
-- uploaded by the server as the teammate, at photos/{user}/{uuid}.jpg. The
-- account keeps its path (user_metadata.photo_path) and the dashboard shows it
-- through a link signed for an hour. Teammates see each other's; each changes
-- only their own.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profile-photos', 'profile-photos', false, 524288, array['image/jpeg'])
on conflict (id) do nothing;

create policy "Team members read profile photos" on storage.objects
  for select to authenticated
  using (bucket_id = 'profile-photos' and (select private.is_team_member()));

create policy "Team members upload their own profile photo" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'profile-photos'
    and (storage.foldername(name))[1] = 'photos'
    and (storage.foldername(name))[2] = (select auth.uid())::text
    and (select private.is_team_member())
  );

create policy "Team members remove their own profile photo" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'profile-photos'
    and (storage.foldername(name))[1] = 'photos'
    and (storage.foldername(name))[2] = (select auth.uid())::text
    and (select private.is_team_member())
  );
