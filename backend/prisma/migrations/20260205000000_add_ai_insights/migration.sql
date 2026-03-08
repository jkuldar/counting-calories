-- CreateTable
CREATE TABLE "ai_insights" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "response" TEXT NOT NULL,
    "contextHash" TEXT NOT NULL,
    "priority" TEXT NOT NULL,
    "isValid" BOOLEAN NOT NULL DEFAULT true,
    "violatesRestrictions" BOOLEAN NOT NULL DEFAULT false,
    "validationNotes" TEXT,
    "model" TEXT NOT NULL,
    "tokensUsed" INTEGER,
    "responseTimeMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "ai_insights_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_insights_userId_contextHash_idx" ON "ai_insights"("userId", "contextHash");

-- CreateIndex
CREATE INDEX "ai_insights_userId_createdAt_idx" ON "ai_insights"("userId", "createdAt");
