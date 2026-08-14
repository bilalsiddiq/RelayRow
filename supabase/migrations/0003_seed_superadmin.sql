-- ============================================================================
-- 0003_seed_superadmin.sql — Initial Super Admin Owner setup
-- ============================================================================
-- Creates super admin owner user bilalsiddiq@gmail.com if not exists.

do $$
declare
  v_user_id uuid;
begin
  -- Check if user already exists in auth.users
  select id into v_user_id from auth.users where email = 'bilalsiddiq@gmail.com';

  if v_user_id is null then
    v_user_id := gen_random_uuid();

    -- Insert into auth.users (encrypted password for 'welcomeme123' using pgcrypto extension or standard crypt)
    insert into auth.users (
      id,
      instance_id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at
    ) values (
      v_user_id,
      '00000000-0000-0000-0000-000000000001',
      'authenticated',
      'authenticated',
      'bilalsiddiq@gmail.com',
      crypt('welcomeme123', gen_salt('bf')),
      now(),
      '{"provider": "email", "providers": ["email"]}',
      '{"display_name": "Bilal Siddiq", "role": "owner"}',
      now(),
      now()
    );
  end if;

  -- Ensure matching staff record with 'owner' role
  insert into public.staff (
    auth_user_id,
    email,
    display_name,
    role
  ) values (
    v_user_id,
    'bilalsiddiq@gmail.com',
    'Bilal Siddiq (Super Admin Owner)',
    'owner'
  )
  on conflict (auth_user_id) do update set
    role = 'owner',
    display_name = 'Bilal Siddiq (Super Admin Owner)',
    email = 'bilalsiddiq@gmail.com';
end $$;
