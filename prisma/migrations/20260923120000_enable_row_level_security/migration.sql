-- Lock every application table away from Supabase's auto-generated REST/
-- GraphQL API (PostgREST), which exposes the `public` schema to anyone
-- holding the project's publishable ("anon") key — a key that is public
-- by design. With RLS enabled and NO policies defined, the `anon` and
-- `authenticated` API roles can read and write nothing.
--
-- The app itself is unaffected: Prisma connects as the tables' owner
-- (`postgres` on Supabase, the compose user locally), and a table's owner
-- bypasses RLS unless FORCE ROW LEVEL SECURITY is set (it deliberately
-- isn't). This app never uses the Supabase client/API.
--
-- Any table added in a future migration must enable RLS the same way.
DO $$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;
END
$$;
