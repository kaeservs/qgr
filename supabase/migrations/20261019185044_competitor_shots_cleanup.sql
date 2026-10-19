-- A screenshot added and then taken away before the run started goes again,
-- by whoever uploaded it; one a run uses stays with the run.
create policy "Team members remove their own screenshots no run uses" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'competitor-shots'
    and (storage.foldername(name))[2] = (select auth.uid())::text
    and (select private.is_team_member())
    and not exists (select 1 from public.runs r where objects.name = any (r.files))
  );
