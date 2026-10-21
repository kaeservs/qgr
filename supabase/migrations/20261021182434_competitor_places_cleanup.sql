-- A competitor's screenshot can be an email or a web page as well as an ad
-- or post on Meta, LinkedIn or X, so an item, and a hook it leads, can be
-- 'email' or 'web'. Replacing a check is a drop, so it sits in its own
-- migration for the owner to confirm (CLAUDE.md, Supabase).

alter table public.competitor_ads drop constraint competitor_ads_platform_check;
alter table public.competitor_ads add constraint competitor_ads_platform_check
  check (platform in ('meta', 'linkedin', 'x', 'email', 'web'));

alter table public.hooks drop constraint hooks_platform_check;
alter table public.hooks add constraint hooks_platform_check
  check (platform in ('meta', 'linkedin', 'x', 'email', 'web'));
