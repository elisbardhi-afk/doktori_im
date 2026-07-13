-- Fix infinite recursion in users update RLS policy
-- Remove the subquery check that caused the recursion
drop policy if exists users_update_self on public.users;
create policy users_update_self on public.users
  for update using (id = auth.uid())
  with check (id = auth.uid());
