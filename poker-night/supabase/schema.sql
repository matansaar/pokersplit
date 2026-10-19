create table if not exists public.pokersplit_games (
  id text primary key,
  game jsonb not null,
  revision integer not null default 1,
  updated_at timestamptz not null default current_timestamp
);
alter table public.pokersplit_games enable row level security;
revoke all on public.pokersplit_games from anon, authenticated;
grant select, insert, update on public.pokersplit_games to service_role;

create or replace function public.pokersplit_save_game(payload jsonb, expected_revision integer)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  saved public.pokersplit_games%rowtype;
  result_record jsonb;
  did_save boolean := false;
begin
  if expected_revision = 0 then
    insert into public.pokersplit_games (id, game)
    values (payload->>'id', payload)
    on conflict (id) do nothing
    returning * into saved;
  else
    update public.pokersplit_games
    set game = payload, revision = revision + 1, updated_at = current_timestamp
    where id = payload->>'id'
      and revision = expected_revision
      and expected_revision > 0
      and (game->>'completedAt') is null
    returning * into saved;
  end if;
  did_save := found;
  if not did_save then
    select * into saved from public.pokersplit_games where id = payload->>'id';
  end if;
  if saved.id is not null then
    result_record := jsonb_build_object('game', saved.game, 'revision', saved.revision, 'updatedAt', saved.updated_at);
  end if;
  return jsonb_build_object('record', result_record, 'conflict', not (did_save or coalesce(saved.game = payload, false)));
end;
$$;
revoke execute on function public.pokersplit_save_game(jsonb, integer) from public, anon, authenticated;
grant execute on function public.pokersplit_save_game(jsonb, integer) to service_role;
notify pgrst, 'reload schema';
