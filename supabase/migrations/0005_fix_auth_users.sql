-- Clear raw inserted user to allow clean GoTrue Auth user creation
delete from auth.users where email = 'bilalsiddiq@gmail.com';
delete from public.staff where email = 'bilalsiddiq@gmail.com';
