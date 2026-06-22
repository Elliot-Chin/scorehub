create or replace function public.advance_room_dealer(p_room_code text)
returns public.rooms
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_room public.rooms%rowtype;
  v_next_index integer;
  v_next_dealer_user_id uuid;
begin
  select *
  into v_room
  from public.rooms
  where room_code = upper(trim(p_room_code));

  if not found then
    raise exception 'room_not_found';
  end if;

  if not exists (
    select 1
    from public.room_players
    where room_id = v_room.id
      and user_id = auth.uid()
      and coalesce(is_active, true) = true
  ) then
    raise exception 'forbidden';
  end if;

  if coalesce(array_length(v_room.dealer_order, 1), 0) = 0 then
    raise exception 'dealer_order_not_set';
  end if;

  v_next_index := array_position(v_room.dealer_order, v_room.current_dealer_user_id);

  if v_next_index is null then
    v_next_index := 1;
  else
    v_next_index := v_next_index + 1;

    if v_next_index > array_length(v_room.dealer_order, 1) then
      v_next_index := 1;
    end if;
  end if;

  v_next_dealer_user_id := v_room.dealer_order[v_next_index];

  update public.rooms
  set current_dealer_user_id = v_next_dealer_user_id
  where id = v_room.id
  returning * into v_room;

  return v_room;
end;
$function$;

revoke all on function public.advance_room_dealer(text) from public;
grant execute on function public.advance_room_dealer(text) to authenticated;
