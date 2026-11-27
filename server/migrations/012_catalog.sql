-- The exercise reference library (RepDB, imported by `cli.js import-repdb`; never in git, see its licence).
-- Shared by every account: the one exception to "every row is owned by a user".
CREATE TABLE catalog_exercise (
  id text PRIMARY KEY,
  data jsonb NOT NULL
);
CREATE TABLE catalog_image (
  name text PRIMARY KEY,
  bytes bytea NOT NULL
);
ALTER TABLE exercise ADD COLUMN catalog_id text;
