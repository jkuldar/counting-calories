-- Add includeGoals column to privacy_settings
ALTER TABLE "privacy_settings" ADD COLUMN IF NOT EXISTS "includeGoals" BOOLEAN NOT NULL DEFAULT true;
