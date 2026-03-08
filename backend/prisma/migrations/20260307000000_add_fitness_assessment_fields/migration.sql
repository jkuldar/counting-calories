-- Add fitness assessment and occupation fields to health_profiles
ALTER TABLE "health_profiles" ADD COLUMN IF NOT EXISTS "exerciseTypes"       TEXT[]  NOT NULL DEFAULT '{}';
ALTER TABLE "health_profiles" ADD COLUMN IF NOT EXISTS "sessionDuration"     TEXT;
ALTER TABLE "health_profiles" ADD COLUMN IF NOT EXISTS "exerciseEnvironment" TEXT;
ALTER TABLE "health_profiles" ADD COLUMN IF NOT EXISTS "exerciseTimeOfDay"   TEXT;
ALTER TABLE "health_profiles" ADD COLUMN IF NOT EXISTS "enduranceMinutes"    INTEGER;
ALTER TABLE "health_profiles" ADD COLUMN IF NOT EXISTS "pushUpsCount"        INTEGER;
ALTER TABLE "health_profiles" ADD COLUMN IF NOT EXISTS "squatsCount"         INTEGER;
ALTER TABLE "health_profiles" ADD COLUMN IF NOT EXISTS "occupationType"      TEXT;
