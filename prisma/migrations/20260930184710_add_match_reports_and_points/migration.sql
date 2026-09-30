-- AlterTable
ALTER TABLE "Match" ADD COLUMN     "manOfTheMatchId" TEXT;

-- CreateTable
CREATE TABLE "MatchAppearance" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "yellowCards" INTEGER NOT NULL DEFAULT 0,
    "redCards" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatchAppearance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MatchAppearance_playerId_idx" ON "MatchAppearance"("playerId");

-- CreateIndex
CREATE UNIQUE INDEX "MatchAppearance_matchId_playerId_key" ON "MatchAppearance"("matchId", "playerId");

-- CreateIndex
CREATE INDEX "Match_manOfTheMatchId_idx" ON "Match"("manOfTheMatchId");

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_manOfTheMatchId_fkey" FOREIGN KEY ("manOfTheMatchId") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchAppearance" ADD CONSTRAINT "MatchAppearance_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchAppearance" ADD CONSTRAINT "MatchAppearance_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;
