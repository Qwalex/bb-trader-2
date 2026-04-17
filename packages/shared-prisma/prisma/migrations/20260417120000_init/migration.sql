-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "telegramUserId" TEXT NOT NULL,
    "telegramUsername" TEXT,
    "displayName" TEXT,
    "photoUrl" TEXT,
    "role" TEXT NOT NULL DEFAULT 'user',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "activeCabinetId" TEXT,
    "issuedVia" TEXT NOT NULL DEFAULT 'telegram_login',
    "userAgent" TEXT,
    "ip" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserbotSession" (
    "userId" TEXT NOT NULL,
    "sessionString" TEXT,
    "phone" TEXT,
    "status" TEXT NOT NULL DEFAULT 'disconnected',
    "lastSeenAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserbotSession_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "UserbotChannel" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "username" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "sourcePriority" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserbotChannel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserbotCommand" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payloadJson" TEXT,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "resultJson" TEXT,
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserbotCommand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cabinet" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "network" TEXT NOT NULL DEFAULT 'mainnet',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cabinet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CabinetBybitKey" (
    "cabinetId" TEXT NOT NULL,
    "apiKeyMainnet" TEXT,
    "apiSecretMainnet" TEXT,
    "apiKeyTestnet" TEXT,
    "apiSecretTestnet" TEXT,
    "testnet" BOOLEAN NOT NULL DEFAULT false,
    "lastVerifiedAt" TIMESTAMP(3),
    "lastVerifyError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CabinetBybitKey_pkey" PRIMARY KEY ("cabinetId")
);

-- CreateTable
CREATE TABLE "CabinetSetting" (
    "id" TEXT NOT NULL,
    "cabinetId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CabinetSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CabinetChannelFilter" (
    "id" TEXT NOT NULL,
    "cabinetId" TEXT NOT NULL,
    "userbotChannelId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "defaultLeverage" INTEGER,
    "forcedLeverage" INTEGER,
    "defaultEntryUsd" TEXT,
    "minLotBump" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CabinetChannelFilter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CabinetPublishGroup" (
    "id" TEXT NOT NULL,
    "cabinetId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "publishEveryN" INTEGER NOT NULL DEFAULT 1,
    "signalCounter" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CabinetPublishGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IngestEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "dedupMessageKey" TEXT NOT NULL,
    "text" TEXT,
    "replyToChatId" TEXT,
    "replyToMessageId" TEXT,
    "replyToText" TEXT,
    "rawJson" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending_classify',
    "classification" TEXT,
    "classifyError" TEXT,
    "classifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IngestEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SignalDraft" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ingestEventId" TEXT NOT NULL,
    "sourceChatId" TEXT NOT NULL,
    "sourceMessageId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "pair" TEXT NOT NULL,
    "entries" TEXT NOT NULL,
    "entryIsRange" BOOLEAN NOT NULL DEFAULT false,
    "stopLoss" DOUBLE PRECISION NOT NULL,
    "takeProfits" TEXT NOT NULL,
    "leverage" INTEGER NOT NULL,
    "signalHash" TEXT NOT NULL,
    "rawMessage" TEXT,
    "aiRequest" TEXT,
    "aiResponse" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ready',
    "rejectReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SignalDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TgUserbotSignalHash" (
    "hash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TgUserbotSignalHash_pkey" PRIMARY KEY ("hash")
);

-- CreateTable
CREATE TABLE "CabinetSignal" (
    "id" TEXT NOT NULL,
    "cabinetId" TEXT NOT NULL,
    "signalDraftId" TEXT NOT NULL,
    "signalId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "skipReason" TEXT,
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CabinetSignal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Signal" (
    "id" TEXT NOT NULL,
    "cabinetId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "pair" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "entries" TEXT NOT NULL,
    "entryIsRange" BOOLEAN NOT NULL DEFAULT false,
    "stopLoss" DOUBLE PRECISION NOT NULL,
    "takeProfits" TEXT NOT NULL,
    "leverage" INTEGER NOT NULL,
    "orderUsd" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "capitalPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "source" TEXT,
    "sourceChatId" TEXT,
    "sourceMessageId" TEXT,
    "signalExternalId" TEXT,
    "rawMessage" TEXT,
    "status" TEXT NOT NULL,
    "realizedPnl" DOUBLE PRECISION,
    "closedAt" TIMESTAMP(3),
    "tpSlStep" INTEGER NOT NULL DEFAULT -1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Signal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SignalEvent" (
    "id" TEXT NOT NULL,
    "cabinetId" TEXT NOT NULL,
    "signalId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SignalEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "cabinetId" TEXT NOT NULL,
    "signalId" TEXT NOT NULL,
    "bybitOrderId" TEXT,
    "orderKind" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "price" DOUBLE PRECISION,
    "qty" DOUBLE PRECISION,
    "status" TEXT NOT NULL,
    "pnl" DOUBLE PRECISION,
    "filledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BalanceSnapshot" (
    "id" TEXT NOT NULL,
    "cabinetId" TEXT NOT NULL,
    "totalUsd" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BalanceSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "cabinetId" TEXT,
    "level" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "service" TEXT,
    "message" TEXT NOT NULL,
    "payload" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TgUserbotMirrorMessage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "publishGroupId" TEXT NOT NULL,
    "ingestId" TEXT NOT NULL,
    "sourceChatId" TEXT NOT NULL,
    "sourceMessageId" TEXT NOT NULL,
    "rootSourceChatId" TEXT,
    "rootSourceMessageId" TEXT,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "targetChatId" TEXT NOT NULL,
    "targetMessageId" TEXT,
    "replyToTargetMessageId" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TgUserbotMirrorMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpenrouterGenerationCost" (
    "id" TEXT NOT NULL,
    "generationId" TEXT NOT NULL,
    "operation" TEXT,
    "chatId" TEXT,
    "source" TEXT,
    "ingestId" TEXT,
    "userId" TEXT,
    "cabinetId" TEXT,
    "costUsd" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextRetryAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OpenrouterGenerationCost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TgUserbotFilterPattern" (
    "id" TEXT NOT NULL,
    "groupName" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "pattern" TEXT NOT NULL,
    "requiresQuote" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TgUserbotFilterPattern_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TgUserbotFilterExample" (
    "id" TEXT NOT NULL,
    "groupName" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "example" TEXT NOT NULL,
    "requiresQuote" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TgUserbotFilterExample_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GlobalSetting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GlobalSetting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "RecalcClosedPnlJob" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "dryRun" BOOLEAN NOT NULL,
    "limit" INTEGER NOT NULL,
    "cabinetId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "resultJson" TEXT,
    "error" TEXT,

    CONSTRAINT "RecalcClosedPnlJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiagnosticRun" (
    "id" TEXT NOT NULL,
    "triggeredByUserId" TEXT,
    "status" TEXT NOT NULL,
    "requestJson" TEXT,
    "modelsJson" TEXT NOT NULL,
    "caseCount" INTEGER NOT NULL DEFAULT 0,
    "summary" TEXT,
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiagnosticRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiagnosticCase" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "ingestId" TEXT,
    "signalId" TEXT,
    "chatId" TEXT,
    "messageId" TEXT,
    "title" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "traceJson" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiagnosticCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiagnosticModelResult" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "summary" TEXT,
    "rawResponse" TEXT,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "totalTokens" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiagnosticModelResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiagnosticStepResult" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "modelResultId" TEXT,
    "stepKey" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "comment" TEXT,
    "issuesJson" TEXT,
    "evidenceJson" TEXT,
    "missingContextJson" TEXT,
    "recommendedFixesJson" TEXT,
    "payloadJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiagnosticStepResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiagnosticLog" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "caseId" TEXT,
    "modelResultId" TEXT,
    "level" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "payload" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiagnosticLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_telegramUserId_key" ON "User"("telegramUserId");

-- CreateIndex
CREATE INDEX "User_enabled_idx" ON "User"("enabled");

-- CreateIndex
CREATE INDEX "Session_userId_expiresAt_idx" ON "Session"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE INDEX "UserbotChannel_userId_enabled_idx" ON "UserbotChannel"("userId", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "UserbotChannel_userId_chatId_key" ON "UserbotChannel"("userId", "chatId");

-- CreateIndex
CREATE INDEX "UserbotCommand_userId_status_createdAt_idx" ON "UserbotCommand"("userId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "UserbotCommand_status_createdAt_idx" ON "UserbotCommand"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Cabinet_ownerUserId_enabled_idx" ON "Cabinet"("ownerUserId", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "Cabinet_ownerUserId_slug_key" ON "Cabinet"("ownerUserId", "slug");

-- CreateIndex
CREATE INDEX "CabinetSetting_key_idx" ON "CabinetSetting"("key");

-- CreateIndex
CREATE UNIQUE INDEX "CabinetSetting_cabinetId_key_key" ON "CabinetSetting"("cabinetId", "key");

-- CreateIndex
CREATE INDEX "CabinetChannelFilter_cabinetId_enabled_idx" ON "CabinetChannelFilter"("cabinetId", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "CabinetChannelFilter_cabinetId_userbotChannelId_key" ON "CabinetChannelFilter"("cabinetId", "userbotChannelId");

-- CreateIndex
CREATE INDEX "CabinetPublishGroup_cabinetId_enabled_idx" ON "CabinetPublishGroup"("cabinetId", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "CabinetPublishGroup_cabinetId_chatId_key" ON "CabinetPublishGroup"("cabinetId", "chatId");

-- CreateIndex
CREATE UNIQUE INDEX "IngestEvent_dedupMessageKey_key" ON "IngestEvent"("dedupMessageKey");

-- CreateIndex
CREATE INDEX "IngestEvent_userId_status_createdAt_idx" ON "IngestEvent"("userId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "IngestEvent_chatId_messageId_idx" ON "IngestEvent"("chatId", "messageId");

-- CreateIndex
CREATE INDEX "IngestEvent_createdAt_idx" ON "IngestEvent"("createdAt");

-- CreateIndex
CREATE INDEX "SignalDraft_userId_status_createdAt_idx" ON "SignalDraft"("userId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "SignalDraft_sourceChatId_sourceMessageId_idx" ON "SignalDraft"("sourceChatId", "sourceMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "SignalDraft_userId_signalHash_key" ON "SignalDraft"("userId", "signalHash");

-- CreateIndex
CREATE UNIQUE INDEX "CabinetSignal_signalId_key" ON "CabinetSignal"("signalId");

-- CreateIndex
CREATE INDEX "CabinetSignal_cabinetId_status_createdAt_idx" ON "CabinetSignal"("cabinetId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "CabinetSignal_status_createdAt_idx" ON "CabinetSignal"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CabinetSignal_cabinetId_signalDraftId_key" ON "CabinetSignal"("cabinetId", "signalDraftId");

-- CreateIndex
CREATE INDEX "Signal_cabinetId_deletedAt_createdAt_idx" ON "Signal"("cabinetId", "deletedAt", "createdAt");

-- CreateIndex
CREATE INDEX "Signal_cabinetId_deletedAt_closedAt_idx" ON "Signal"("cabinetId", "deletedAt", "closedAt");

-- CreateIndex
CREATE INDEX "Signal_cabinetId_sourceChatId_sourceMessageId_idx" ON "Signal"("cabinetId", "sourceChatId", "sourceMessageId");

-- CreateIndex
CREATE INDEX "Signal_cabinetId_sourceChatId_signalExternalId_idx" ON "Signal"("cabinetId", "sourceChatId", "signalExternalId");

-- CreateIndex
CREATE INDEX "Signal_userId_createdAt_idx" ON "Signal"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "SignalEvent_signalId_createdAt_idx" ON "SignalEvent"("signalId", "createdAt");

-- CreateIndex
CREATE INDEX "SignalEvent_cabinetId_createdAt_idx" ON "SignalEvent"("cabinetId", "createdAt");

-- CreateIndex
CREATE INDEX "Order_signalId_idx" ON "Order"("signalId");

-- CreateIndex
CREATE INDEX "Order_cabinetId_status_createdAt_idx" ON "Order"("cabinetId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "BalanceSnapshot_cabinetId_createdAt_idx" ON "BalanceSnapshot"("cabinetId", "createdAt");

-- CreateIndex
CREATE INDEX "AppLog_createdAt_idx" ON "AppLog"("createdAt");

-- CreateIndex
CREATE INDEX "AppLog_cabinetId_createdAt_idx" ON "AppLog"("cabinetId", "createdAt");

-- CreateIndex
CREATE INDEX "AppLog_userId_createdAt_idx" ON "AppLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AppLog_category_createdAt_idx" ON "AppLog"("category", "createdAt");

-- CreateIndex
CREATE INDEX "AppLog_level_createdAt_idx" ON "AppLog"("level", "createdAt");

-- CreateIndex
CREATE INDEX "TgUserbotMirrorMessage_publishGroupId_sourceChatId_sourceMe_idx" ON "TgUserbotMirrorMessage"("publishGroupId", "sourceChatId", "sourceMessageId", "kind");

-- CreateIndex
CREATE INDEX "TgUserbotMirrorMessage_publishGroupId_rootSourceChatId_root_idx" ON "TgUserbotMirrorMessage"("publishGroupId", "rootSourceChatId", "rootSourceMessageId", "kind");

-- CreateIndex
CREATE INDEX "TgUserbotMirrorMessage_userId_createdAt_idx" ON "TgUserbotMirrorMessage"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TgUserbotMirrorMessage_publishGroupId_ingestId_kind_key" ON "TgUserbotMirrorMessage"("publishGroupId", "ingestId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "OpenrouterGenerationCost_generationId_key" ON "OpenrouterGenerationCost"("generationId");

-- CreateIndex
CREATE INDEX "OpenrouterGenerationCost_status_nextRetryAt_idx" ON "OpenrouterGenerationCost"("status", "nextRetryAt");

-- CreateIndex
CREATE INDEX "OpenrouterGenerationCost_createdAt_idx" ON "OpenrouterGenerationCost"("createdAt");

-- CreateIndex
CREATE INDEX "OpenrouterGenerationCost_userId_createdAt_idx" ON "OpenrouterGenerationCost"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "TgUserbotFilterPattern_groupName_kind_enabled_idx" ON "TgUserbotFilterPattern"("groupName", "kind", "enabled");

-- CreateIndex
CREATE INDEX "TgUserbotFilterExample_groupName_kind_enabled_idx" ON "TgUserbotFilterExample"("groupName", "kind", "enabled");

-- CreateIndex
CREATE INDEX "RecalcClosedPnlJob_createdAt_idx" ON "RecalcClosedPnlJob"("createdAt");

-- CreateIndex
CREATE INDEX "RecalcClosedPnlJob_cabinetId_createdAt_idx" ON "RecalcClosedPnlJob"("cabinetId", "createdAt");

-- CreateIndex
CREATE INDEX "DiagnosticRun_createdAt_idx" ON "DiagnosticRun"("createdAt");

-- CreateIndex
CREATE INDEX "DiagnosticRun_status_createdAt_idx" ON "DiagnosticRun"("status", "createdAt");

-- CreateIndex
CREATE INDEX "DiagnosticCase_runId_createdAt_idx" ON "DiagnosticCase"("runId", "createdAt");

-- CreateIndex
CREATE INDEX "DiagnosticCase_ingestId_idx" ON "DiagnosticCase"("ingestId");

-- CreateIndex
CREATE INDEX "DiagnosticCase_signalId_idx" ON "DiagnosticCase"("signalId");

-- CreateIndex
CREATE INDEX "DiagnosticModelResult_runId_model_idx" ON "DiagnosticModelResult"("runId", "model");

-- CreateIndex
CREATE INDEX "DiagnosticModelResult_caseId_createdAt_idx" ON "DiagnosticModelResult"("caseId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DiagnosticModelResult_runId_caseId_model_key" ON "DiagnosticModelResult"("runId", "caseId", "model");

-- CreateIndex
CREATE INDEX "DiagnosticStepResult_runId_caseId_createdAt_idx" ON "DiagnosticStepResult"("runId", "caseId", "createdAt");

-- CreateIndex
CREATE INDEX "DiagnosticStepResult_modelResultId_stepKey_idx" ON "DiagnosticStepResult"("modelResultId", "stepKey");

-- CreateIndex
CREATE INDEX "DiagnosticLog_runId_createdAt_idx" ON "DiagnosticLog"("runId", "createdAt");

-- CreateIndex
CREATE INDEX "DiagnosticLog_caseId_createdAt_idx" ON "DiagnosticLog"("caseId", "createdAt");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_activeCabinetId_fkey" FOREIGN KEY ("activeCabinetId") REFERENCES "Cabinet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserbotSession" ADD CONSTRAINT "UserbotSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserbotChannel" ADD CONSTRAINT "UserbotChannel_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserbotCommand" ADD CONSTRAINT "UserbotCommand_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cabinet" ADD CONSTRAINT "Cabinet_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CabinetBybitKey" ADD CONSTRAINT "CabinetBybitKey_cabinetId_fkey" FOREIGN KEY ("cabinetId") REFERENCES "Cabinet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CabinetSetting" ADD CONSTRAINT "CabinetSetting_cabinetId_fkey" FOREIGN KEY ("cabinetId") REFERENCES "Cabinet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CabinetChannelFilter" ADD CONSTRAINT "CabinetChannelFilter_cabinetId_fkey" FOREIGN KEY ("cabinetId") REFERENCES "Cabinet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CabinetChannelFilter" ADD CONSTRAINT "CabinetChannelFilter_userbotChannelId_fkey" FOREIGN KEY ("userbotChannelId") REFERENCES "UserbotChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CabinetPublishGroup" ADD CONSTRAINT "CabinetPublishGroup_cabinetId_fkey" FOREIGN KEY ("cabinetId") REFERENCES "Cabinet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngestEvent" ADD CONSTRAINT "IngestEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignalDraft" ADD CONSTRAINT "SignalDraft_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignalDraft" ADD CONSTRAINT "SignalDraft_ingestEventId_fkey" FOREIGN KEY ("ingestEventId") REFERENCES "IngestEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CabinetSignal" ADD CONSTRAINT "CabinetSignal_cabinetId_fkey" FOREIGN KEY ("cabinetId") REFERENCES "Cabinet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CabinetSignal" ADD CONSTRAINT "CabinetSignal_signalDraftId_fkey" FOREIGN KEY ("signalDraftId") REFERENCES "SignalDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CabinetSignal" ADD CONSTRAINT "CabinetSignal_signalId_fkey" FOREIGN KEY ("signalId") REFERENCES "Signal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Signal" ADD CONSTRAINT "Signal_cabinetId_fkey" FOREIGN KEY ("cabinetId") REFERENCES "Cabinet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Signal" ADD CONSTRAINT "Signal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignalEvent" ADD CONSTRAINT "SignalEvent_cabinetId_fkey" FOREIGN KEY ("cabinetId") REFERENCES "Cabinet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignalEvent" ADD CONSTRAINT "SignalEvent_signalId_fkey" FOREIGN KEY ("signalId") REFERENCES "Signal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_cabinetId_fkey" FOREIGN KEY ("cabinetId") REFERENCES "Cabinet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_signalId_fkey" FOREIGN KEY ("signalId") REFERENCES "Signal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BalanceSnapshot" ADD CONSTRAINT "BalanceSnapshot_cabinetId_fkey" FOREIGN KEY ("cabinetId") REFERENCES "Cabinet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppLog" ADD CONSTRAINT "AppLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppLog" ADD CONSTRAINT "AppLog_cabinetId_fkey" FOREIGN KEY ("cabinetId") REFERENCES "Cabinet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TgUserbotMirrorMessage" ADD CONSTRAINT "TgUserbotMirrorMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TgUserbotMirrorMessage" ADD CONSTRAINT "TgUserbotMirrorMessage_publishGroupId_fkey" FOREIGN KEY ("publishGroupId") REFERENCES "CabinetPublishGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TgUserbotMirrorMessage" ADD CONSTRAINT "TgUserbotMirrorMessage_ingestId_fkey" FOREIGN KEY ("ingestId") REFERENCES "IngestEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiagnosticCase" ADD CONSTRAINT "DiagnosticCase_runId_fkey" FOREIGN KEY ("runId") REFERENCES "DiagnosticRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiagnosticModelResult" ADD CONSTRAINT "DiagnosticModelResult_runId_fkey" FOREIGN KEY ("runId") REFERENCES "DiagnosticRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiagnosticModelResult" ADD CONSTRAINT "DiagnosticModelResult_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "DiagnosticCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiagnosticStepResult" ADD CONSTRAINT "DiagnosticStepResult_runId_fkey" FOREIGN KEY ("runId") REFERENCES "DiagnosticRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiagnosticStepResult" ADD CONSTRAINT "DiagnosticStepResult_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "DiagnosticCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiagnosticStepResult" ADD CONSTRAINT "DiagnosticStepResult_modelResultId_fkey" FOREIGN KEY ("modelResultId") REFERENCES "DiagnosticModelResult"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiagnosticLog" ADD CONSTRAINT "DiagnosticLog_runId_fkey" FOREIGN KEY ("runId") REFERENCES "DiagnosticRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiagnosticLog" ADD CONSTRAINT "DiagnosticLog_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "DiagnosticCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiagnosticLog" ADD CONSTRAINT "DiagnosticLog_modelResultId_fkey" FOREIGN KEY ("modelResultId") REFERENCES "DiagnosticModelResult"("id") ON DELETE CASCADE ON UPDATE CASCADE;

