-- Fix "permission denied for table" when schema was applied as postgres but the app uses eobtracker.
-- Run as superuser: psql -d eobtracker -f database/grant-app-user.sql

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO eobtracker;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO eobtracker;

-- Future tables created by postgres in this database
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO eobtracker;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO eobtracker;
