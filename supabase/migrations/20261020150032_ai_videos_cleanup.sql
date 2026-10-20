-- A first picture added and then taken away goes again, by whoever uploaded
-- it; one a video was asked from stays with the video.
create policy "Team members remove their own first pictures no video uses" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'video-refs'
    and (storage.foldername(name))[2] = (select auth.uid())::text
    and (select private.is_team_member())
    and not exists (select 1 from public.ai_videos v where v.picture_path = objects.name)
  );
