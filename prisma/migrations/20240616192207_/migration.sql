-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_DailyPlaytime" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" DATETIME NOT NULL,
    "playerId" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "playtime" INTEGER NOT NULL,
    CONSTRAINT "DailyPlaytime_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DailyPlaytime_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_DailyPlaytime" ("date", "id", "playerId", "playtime", "serverId") SELECT "date", "id", "playerId", "playtime", "serverId" FROM "DailyPlaytime";
DROP TABLE "DailyPlaytime";
ALTER TABLE "new_DailyPlaytime" RENAME TO "DailyPlaytime";
CREATE UNIQUE INDEX "DailyPlaytime_date_playerId_serverId_key" ON "DailyPlaytime"("date", "playerId", "serverId");
CREATE TABLE "new_PlayerSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "playerId" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "startTime" DATETIME NOT NULL,
    "endTime" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PlayerSession_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PlayerSession_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_PlayerSession" ("createdAt", "endTime", "id", "playerId", "serverId", "startTime", "updatedAt") SELECT "createdAt", "endTime", "id", "playerId", "serverId", "startTime", "updatedAt" FROM "PlayerSession";
DROP TABLE "PlayerSession";
ALTER TABLE "new_PlayerSession" RENAME TO "PlayerSession";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
