/*
  Warnings:

  - You are about to drop the `DailyPlaytime` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `MonthlyPlaytime` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `WeeklyPlaytime` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `_PlayerToServer` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the column `tgChatId` on the `LiveMessage` table. All the data in the column will be lost.
  - You are about to alter the column `tgMessageId` on the `LiveMessage` table. The data in that column could be lost. The data in that column will be cast from `BigInt` to `Int`.
  - You are about to drop the column `serverId` on the `Player` table. All the data in the column will be lost.
  - You are about to drop the column `host` on the `Server` table. All the data in the column will be lost.
  - You are about to drop the column `port` on the `Server` table. All the data in the column will be lost.
  - Added the required column `serverId` to the `LiveMessage` table without a default value. This is not possible if the table is not empty.
  - Added the required column `address` to the `Server` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "DailyPlaytime_date_playerId_serverId_key";

-- DropIndex
DROP INDEX "MonthlyPlaytime_month_year_playerId_serverId_key";

-- DropIndex
DROP INDEX "WeeklyPlaytime_week_year_playerId_serverId_key";

-- DropIndex
DROP INDEX "_PlayerToServer_B_index";

-- DropIndex
DROP INDEX "_PlayerToServer_AB_unique";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "DailyPlaytime";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "MonthlyPlaytime";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "WeeklyPlaytime";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "_PlayerToServer";
PRAGMA foreign_keys=on;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_LiveMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tgMessageId" INTEGER NOT NULL,
    "chatWatcherTgChatId" BIGINT NOT NULL,
    "addedById" TEXT NOT NULL,
    "groupId" TEXT,
    "editable" BOOLEAN NOT NULL DEFAULT true,
    "editedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "serverId" TEXT NOT NULL,
    CONSTRAINT "LiveMessage_chatWatcherTgChatId_fkey" FOREIGN KEY ("chatWatcherTgChatId") REFERENCES "ChatWatcher" ("tgChatId") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LiveMessage_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "LiveMessage_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LiveMessage_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_LiveMessage" ("addedById", "chatWatcherTgChatId", "createdAt", "groupId", "id", "tgMessageId", "updatedAt") SELECT "addedById", "chatWatcherTgChatId", "createdAt", "groupId", "id", "tgMessageId", "updatedAt" FROM "LiveMessage";
DROP TABLE "LiveMessage";
ALTER TABLE "new_LiveMessage" RENAME TO "LiveMessage";
CREATE UNIQUE INDEX "LiveMessage_tgMessageId_chatWatcherTgChatId_key" ON "LiveMessage"("tgMessageId", "chatWatcherTgChatId");
CREATE TABLE "new_Player" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "uuid" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Player" ("createdAt", "id", "name", "updatedAt", "uuid") SELECT "createdAt", "id", "name", "updatedAt", "uuid" FROM "Player";
DROP TABLE "Player";
ALTER TABLE "new_Player" RENAME TO "Player";
CREATE UNIQUE INDEX "Player_uuid_key" ON "Player"("uuid");
CREATE TABLE "new_Server" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "address" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "isPollingEnabled" BOOLEAN NOT NULL DEFAULT true
);
INSERT INTO "new_Server" ("createdAt", "id", "updatedAt") SELECT "createdAt", "id", "updatedAt" FROM "Server";
DROP TABLE "Server";
ALTER TABLE "new_Server" RENAME TO "Server";
CREATE UNIQUE INDEX "Server_address_key" ON "Server"("address");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
