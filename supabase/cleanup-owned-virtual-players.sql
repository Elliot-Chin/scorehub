create or replace function public.leave_room(p_room_code text)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_room public.rooms%rowtype;
  v_removed_player_ids uuid[];
  v_next_dealer_user_id uuid;
begin
  select *
  into v_room
  from public.rooms
  where room_code = upper(trim(p_room_code));

  if not found then
    return 'room_not_found';
  end if;

  if auth.uid() is not distinct from v_room.host_user_id then
    delete from public.rooms
    where id = v_room.id;

    return 'ok';
  end if;

  select array_agg(rp.user_id order by rp.joined_at)
  into v_removed_player_ids
  from public.room_players rp
  where rp.room_id = v_room.id
    and (
      rp.user_id = auth.uid()
      or (
        coalesce(rp.is_virtual, false) = true
        and rp.created_by_user_id = auth.uid()
      )
    )
    and coalesce(rp.is_active, true) = true;

  if coalesce(array_length(v_removed_player_ids, 1), 0) = 0 then
    return 'player_not_in_room';
  end if;

  update public.room_players
  set is_active = false,
      removed_at = timezone('utc', now())
  where room_id = v_room.id
    and user_id = any(v_removed_player_ids)
    and coalesce(is_active, true) = true;

  update public.rooms
  set dealer_order = (
        select coalesce(array_agg(next_id order by ordinality), '{}'::uuid[])
        from unnest(coalesce(rooms.dealer_order, '{}'::uuid[])) with ordinality as dealer_ids(next_id, ordinality)
        where not (next_id = any(v_removed_player_ids))
      )
  where id = v_room.id;

  select dealer_ids.next_id
  into v_next_dealer_user_id
  from public.rooms updated_room
  cross join lateral unnest(coalesce(updated_room.dealer_order, '{}'::uuid[])) with ordinality as dealer_ids(next_id, ordinality)
  where updated_room.id = v_room.id
  order by dealer_ids.ordinality
  limit 1;

  update public.rooms
  set current_dealer_user_id = case
        when current_dealer_user_id = any(v_removed_player_ids) then v_next_dealer_user_id
        else current_dealer_user_id
      end
  where id = v_room.id;

  delete from public.rooms
  where id = v_room.id
    and not exists (
      select 1
      from public.room_players
      where room_id = v_room.id
        and coalesce(is_active, true) = true
    );

  return 'ok';
end;
$function$;

create or replace function public.kick_player_from_room(p_room_code text, p_player_user_id uuid)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_room public.rooms%rowtype;
  v_removed_player_ids uuid[];
  v_next_dealer_user_id uuid;
begin
  select *
  into v_room
  from public.rooms
  where room_code = upper(trim(p_room_code));

  if not found then
    return 'room_not_found';
  end if;

  if auth.uid() is distinct from v_room.host_user_id then
    return 'forbidden';
  end if;

  if p_player_user_id = v_room.host_user_id then
    return 'cannot_kick_host';
  end if;

  select array_agg(rp.user_id order by rp.joined_at)
  into v_removed_player_ids
  from public.room_players rp
  where rp.room_id = v_room.id
    and (
      rp.user_id = p_player_user_id
      or (
        coalesce(rp.is_virtual, false) = true
        and rp.created_by_user_id = p_player_user_id
      )
    )
    and coalesce(rp.is_active, true) = true;

  if coalesce(array_length(v_removed_player_ids, 1), 0) = 0 then
    return 'player_not_in_room';
  end if;

  update public.room_players
  set is_active = false,
      removed_at = timezone('utc', now())
  where room_id = v_room.id
    and user_id = any(v_removed_player_ids)
    and coalesce(is_active, true) = true;

  update public.rooms
  set dealer_order = (
        select coalesce(array_agg(next_id order by ordinality), '{}'::uuid[])
        from unnest(coalesce(rooms.dealer_order, '{}'::uuid[])) with ordinality as dealer_ids(next_id, ordinality)
        where not (next_id = any(v_removed_player_ids))
      )
  where id = v_room.id;

  select dealer_ids.next_id
  into v_next_dealer_user_id
  from public.rooms updated_room
  cross join lateral unnest(coalesce(updated_room.dealer_order, '{}'::uuid[])) with ordinality as dealer_ids(next_id, ordinality)
  where updated_room.id = v_room.id
  order by dealer_ids.ordinality
  limit 1;

  update public.rooms
  set current_dealer_user_id = case
        when current_dealer_user_id = any(v_removed_player_ids) then v_next_dealer_user_id
        else current_dealer_user_id
      end
  where id = v_room.id;

  delete from public.rooms
  where id = v_room.id
    and not exists (
      select 1
      from public.room_players
      where room_id = v_room.id
        and coalesce(is_active, true) = true
    );

  return 'ok';
end;
$function$;
