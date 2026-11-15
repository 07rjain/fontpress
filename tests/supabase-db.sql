-- Run ONLY through check-supabase-db.ts in its disposable cluster.
do $$
begin
  assert not has_table_privilege('anon', 'public.handpress_fonts', 'select');
  assert not has_table_privilege('authenticated', 'public.handpress_uploads', 'select');
  assert not has_function_privilege('anon', 'public.handpress_commit_upload(uuid,text,jsonb)', 'execute');
  assert not has_function_privilege('authenticated', 'public.handpress_reserve_upload(text,uuid,uuid)', 'execute');
  assert (select relrowsecurity from pg_class where oid = 'public.handpress_fonts'::regclass);
  assert not (select public from storage.buckets where id = 'handpress');
end $$;
set role service_role;
do $$
declare a uuid := '11111111-1111-4111-8111-111111111111';
  b uuid := '22222222-2222-4222-8222-222222222222';
  c uuid := '33333333-3333-4333-8333-333333333333';
  v_upload public.handpress_uploads;
  metadata jsonb := '{"owner_name":"Alice","name":"Brush 100%","designer":"Me","visibility":"public","glyph_count":85,"size":1000,"updated_at":1000}';
begin
  select * into v_upload from public.handpress_reserve_upload('alice', null, a);
  assert v_upload.font_id = a and v_upload.expected_version is null;
  -- Neither another owner nor an unclaimed upload can finalize.
  assert not public.handpress_commit_upload(a, 'bob', metadata);
  assert not public.handpress_commit_upload(a, 'alice', metadata);
  update public.handpress_uploads set state = 'processing' where id = a;
  assert public.handpress_commit_upload(a, 'alice', metadata);
  assert not public.handpress_commit_upload(a, 'alice', metadata);
  assert (select version = a and owner_id = 'alice' from public.handpress_fonts where id = a);
  begin
    perform public.handpress_reserve_upload('bob', a, b);
    raise exception 'Ownership guard failed';
  exception when others then
    if sqlerrm <> 'FONT_NOT_FOUND' then raise; end if;
  end;
  assert (public.handpress_public_page('brush', 24, 0)->>'total')::int = 1;
  assert (public.handpress_public_page('%', 24, 0)->>'total')::int = 1;
  assert (public.handpress_public_page('_', 24, 0)->>'total')::int = 0;
  select * into v_upload from public.handpress_reserve_upload('alice', a, b);
  assert v_upload.expected_version = a;
  perform public.handpress_reserve_upload('alice', a, c);
  update public.handpress_uploads set state = 'processing' where id in (b, c);
  -- A replacement uses a private version; a stale public replacement must fail.
  assert public.handpress_commit_upload(b, 'alice', jsonb_set(metadata, '{visibility}', '"private"'));
  assert not public.handpress_commit_upload(c, 'alice', metadata);
  assert (select version = b and visibility = 'private' and created_at = 1000 from public.handpress_fonts where id = a);
  assert (public.handpress_public_page('brush', 24, 0)->>'total')::int = 0;
  select * into v_upload from public.handpress_reserve_upload('expired', null, '44444444-4444-4444-8444-444444444444');
  update public.handpress_uploads set state = 'processing', created_at = now() - interval '16 minutes' where id = v_upload.id;
  assert not public.handpress_commit_upload(v_upload.id, 'expired', metadata);
  -- Pending and hourly limits are checked with the same per-owner transaction lock.
  for i in 1..3 loop
    perform public.handpress_reserve_upload('pending', null, ('55555555-5555-4555-8555-' || lpad(i::text, 12, '0'))::uuid);
  end loop;
  begin
    perform public.handpress_reserve_upload('pending', null, '55555555-5555-4555-8555-000000000004');
    raise exception 'Pending limit failed';
  exception when others then
    if sqlerrm <> 'UPLOAD_PENDING_LIMIT' then raise; end if;
  end;
  for i in 1..30 loop
    insert into public.handpress_uploads(id, font_id, owner_id, state) values (
      ('66666666-6666-4666-8666-' || lpad(i::text, 12, '0'))::uuid, a, 'rate', 'failed');
  end loop;
  begin
    perform public.handpress_reserve_upload('rate', null, '66666666-6666-4666-8666-000000000031');
    raise exception 'Rate limit failed';
  exception when others then
    if sqlerrm <> 'UPLOAD_RATE_LIMIT' then raise; end if;
  end;
end $$;
reset role;
insert into public.handpress_fonts(id, owner_id, owner_name, name, designer, visibility, glyph_count, size, created_at, updated_at, version, font_path, project_path)
select ('77777777-7777-4777-8777-' || lpad(i::text, 12, '0'))::uuid, 'quota', 'Quota', 'Fixture', '', 'private', 1, 100, 1, 1,
  ('77777777-7777-4777-8777-' || lpad(i::text, 12, '0'))::uuid, 'font', 'project' from generate_series(1,49) as i;
