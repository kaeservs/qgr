-- Files the editor uploaded that no saved edit uses can be taken back by
-- whoever uploaded them (the editor does so when it closes).

-- A file added and then left out before the edit was saved goes again; one an
-- edit uses stays.
create policy "Team members remove their own edit media no edit uses" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'edit-media'
    and (storage.foldername(name))[2] = (select auth.uid())::text
    and (select private.is_team_member())
    and not exists (
      select 1 from public.ad_variants v
       where v.video_edit is not null and strpos(v.video_edit::text, '"' || objects.name || '"') > 0)
  );
