-- ============================================================================
-- Read-only Postgres role for nightly pg_dump backups.
--
-- Used by the GitHub Actions workflow in chaithra-rajesh/Billing-system-backups.
-- The connection string stored in the GitHub secret SUPABASE_DB_URL uses this
-- role, NOT the postgres superuser. If the secret ever leaks, the worst
-- damage is read-only — the role cannot DROP, INSERT, UPDATE, or DELETE.
--
-- Password is NOT set in this migration on purpose (passwords don't belong in
-- git). After running the migration, set it manually in the Supabase SQL
-- Editor:
--
--   alter role backup_reader with password '<long-random-string>';
--
-- Then put the resulting connection string into the GitHub secret:
--
--   postgresql://backup_reader:<password>@db.<ref>.supabase.co:5432/postgres
-- ============================================================================

create role backup_reader with login noinherit;

-- pg_read_all_data is a predefined role in Postgres 14+ that grants SELECT
-- on every table in every schema (including future tables) and USAGE on every
-- schema. It's exactly what pg_dump needs to read the entire database.
grant pg_read_all_data to backup_reader;

-- Allow connecting to the database. Required even with pg_read_all_data.
grant connect on database postgres to backup_reader;

comment on role backup_reader is
  'Read-only role used by the daily GitHub Actions backup workflow. Do not use for application connections.';


-- psql "postgresql://postgres:NEW_PASSWORD@db.NEW-PROJECT-REF.supabase.co:5432/postgres" -1 -v ON_ERROR_STOP=1 -f 2026-05-09.sql