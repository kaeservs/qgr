-- Brand memory, part 2: posts that work, pasted by the team or marked "This
-- worked" on a post that went out. Read by the team (RLS) and changed only
-- through the functions below.

create table public.brand_examples (
  id uuid primary key default gen_random_uuid(),
  place text not null check (place in ('facebook', 'instagram', 'linkedin', 'x')),
  text text not null check (char_length(text) between 1 and 3000),
  note text check (note is null or char_length(note) between 1 and 300),
  -- Pasted by the team, or marked "This worked" on a post that went out.
  source text not null check (source in ('pasted', 'marked')),
  post_id uuid references public.posts (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
-- A post that went out is kept once per place.
create unique index brand_examples_post_place on public.brand_examples (post_id, place) where post_id is not null;

alter table public.brand_examples enable row level security;
create policy "Team members read brand examples" on public.brand_examples
  for select to authenticated using ((select private.is_team_member()));
revoke all on public.brand_examples from anon, authenticated;
grant select on public.brand_examples to authenticated;

-- A post that works, pasted by the team.
create function public.add_brand_example(p_place text, p_text text, p_note text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := private.require_team_member();
  v_id uuid;
begin
  if p_place is null or p_place not in ('facebook', 'instagram', 'linkedin', 'x') then
    raise exception 'A post that works is from Facebook, Instagram, LinkedIn or X';
  end if;
  if coalesce(length(btrim(p_text)), 0) not between 1 and 3000 then
    raise exception 'Paste the post, up to 3,000 characters';
  end if;
  if length(btrim(p_note)) > 300 then
    raise exception 'Keep the note under 300 characters';
  end if;
  if (select count(*) from public.brand_examples) >= 60 then
    raise exception 'Brand memory keeps up to 60 posts. Remove one first';
  end if;
  insert into public.brand_examples (place, text, note, source, created_by)
  values (p_place, btrim(p_text), nullif(btrim(coalesce(p_note, '')), ''), 'pasted', v_user)
  returning id into v_id;
  return v_id;
end
$$;

-- "This worked" on a post that went out: its words for that place are kept as
-- a post that works, whichever way it went out.
create function public.remember_post(p_post_id uuid, p_place text, p_note text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := private.require_team_member();
  v_text text;
  v_id uuid;
begin
  select t.text into v_text
    from public.post_targets t
   where t.post_id = p_post_id and t.place = p_place and t.status = 'posted';
  if v_text is null then
    raise exception 'Only a post that went out can be kept as one that works';
  end if;
  if exists (select 1 from public.brand_examples where post_id = p_post_id and place = p_place) then
    raise exception 'That post is already in brand memory';
  end if;
  if length(btrim(p_note)) > 300 then
    raise exception 'Keep the note under 300 characters';
  end if;
  if (select count(*) from public.brand_examples) >= 60 then
    raise exception 'Brand memory keeps up to 60 posts. Remove one first';
  end if;
  insert into public.brand_examples (place, text, note, source, post_id, created_by)
  values (p_place, v_text, nullif(btrim(coalesce(p_note, '')), ''), 'marked', p_post_id, v_user)
  returning id into v_id;
  return v_id;
end
$$;

revoke execute on function
  public.add_brand_example(text, text, text),
  public.remember_post(uuid, text, text)
from public, anon;
grant execute on function
  public.add_brand_example(text, text, text),
  public.remember_post(uuid, text, text)
to authenticated, service_role;
