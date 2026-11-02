-- Existing ADMIN profiles remain ADMIN. No OWNER is assigned by this migration.
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'OWNER';
