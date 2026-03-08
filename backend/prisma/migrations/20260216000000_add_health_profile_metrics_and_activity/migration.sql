-- Add derived metrics columns to health_profiles
ALTER TABLE "health_profiles" ADD COLUMN IF NOT EXISTS "bmi" DOUBLE PRECISION;
ALTER TABLE "health_profiles" ADD COLUMN IF NOT EXISTS "bmiClass" TEXT;
ALTER TABLE "health_profiles" ADD COLUMN IF NOT EXISTS "wellnessScore" INTEGER;
ALTER TABLE "health_profiles" ADD COLUMN IF NOT EXISTS "progressPercent" DOUBLE PRECISION;
ALTER TABLE "health_profiles" ADD COLUMN IF NOT EXISTS "nextMilestonePercent" DOUBLE PRECISION;
ALTER TABLE "health_profiles" ADD COLUMN IF NOT EXISTS "activityStreakDays" INTEGER;
ALTER TABLE "health_profiles" ADD COLUMN IF NOT EXISTS "habitStreakDays" INTEGER;

-- CreateTable
CREATE TABLE IF NOT EXISTS "activity_entries" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT,
    "durationMin" INTEGER,
    "intensity" TEXT,
    "calories" DOUBLE PRECISION,
    "steps" INTEGER,
    "loggedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,

    CONSTRAINT "activity_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "habit_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "habitType" TEXT NOT NULL,
    "loggedDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,

    CONSTRAINT "habit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "activity_entries_userId_loggedAt_key" ON "activity_entries"("userId", "loggedAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "habit_logs_userId_habitType_loggedDate_key" ON "habit_logs"("userId", "habitType", "loggedDate");

-- AddForeignKey
ALTER TABLE "activity_entries" ADD CONSTRAINT "activity_entries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "habit_logs" ADD CONSTRAINT "habit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
