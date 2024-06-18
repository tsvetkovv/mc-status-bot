-- CreateTable
CREATE TABLE "Group" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "chatId" BIGINT NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ChatWatcher" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tgChatId" BIGINT NOT NULL,
    "isGroup" BOOLEAN NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "LiveMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tgMessageId" BIGINT NOT NULL,
    "tgChatId" BIGINT NOT NULL,
    "chatWatcherTgChatId" BIGINT NOT NULL,
    "addedById" TEXT NOT NULL,
    "groupId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LiveMessage_chatWatcherTgChatId_fkey" FOREIGN KEY ("chatWatcherTgChatId") REFERENCES "ChatWatcher" ("tgChatId") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "LiveMessage_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "LiveMessage_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Group_chatId_key" ON "Group"("chatId");

-- CreateIndex
CREATE UNIQUE INDEX "ChatWatcher_tgChatId_key" ON "ChatWatcher"("tgChatId");

-- CreateIndex
CREATE UNIQUE INDEX "LiveMessage_tgMessageId_tgChatId_key" ON "LiveMessage"("tgMessageId", "tgChatId");
