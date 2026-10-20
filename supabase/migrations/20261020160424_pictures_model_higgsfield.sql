-- Higgsfield joins the image models. A check cannot be changed in place, so
-- the old one goes and a wider one takes its place in the same transaction:
-- every value allowed before is allowed still.
alter table public.team_settings drop constraint team_settings_pictures_model_check;
alter table public.team_settings
  add constraint team_settings_pictures_model_check check (pictures_model in ('stand-in', 'cloudflare', 'higgsfield'));
