-- A reference picture added and then taken away before its run started goes
-- again, by whoever uploaded it; one a run uses stays with the run.
create policy "Team members remove their own reference pictures no run uses" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'run-refs'
    and (storage.foldername(name))[2] = (select auth.uid())::text
    and (select private.is_team_member())
    and not exists (select 1 from public.run_references r where r.path = objects.name)
  );
