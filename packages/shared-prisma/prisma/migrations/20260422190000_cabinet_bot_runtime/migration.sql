-- CreateTable
CREATE TABLE "CabinetTelegramBot" (
    "cabinetId" TEXT NOT NULL,
    "botTokenEncrypted" TEXT NOT NULL,
    "botUsername" TEXT,
    "signalChatId" TEXT,
    "logChatId" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "webhookSecret" TEXT NOT NULL,
    "lastVerifiedAt" TIMESTAMP(3),
    "lastVerifyError" TEXT,
    "lastInboundAt" TIMESTAMP(3),
    "lastOutboundAt" TIMESTAMP(3),
    "lastLogSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CabinetTelegramBot_pkey" PRIMARY KEY ("cabinetId")
);

-- CreateTable
CREATE TABLE "CabinetBotLogDelivery" (
    "id" TEXT NOT NULL,
    "cabinetId" TEXT NOT NULL,
    "appLogId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CabinetBotLogDelivery_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "IngestEvent"
ADD COLUMN "cabinetId" TEXT,
ADD COLUMN "sourceType" TEXT NOT NULL DEFAULT 'userbot';

-- AlterTable
ALTER TABLE "SignalDraft"
ADD COLUMN "sourceType" TEXT NOT NULL DEFAULT 'userbot',
ADD COLUMN "targetCabinetId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "CabinetTelegramBot_webhookSecret_key" ON "CabinetTelegramBot"("webhookSecret");

-- CreateIndex
CREATE INDEX "IngestEvent_cabinetId_status_createdAt_idx" ON "IngestEvent"("cabinetId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "SignalDraft_targetCabinetId_status_createdAt_idx" ON "SignalDraft"("targetCabinetId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CabinetBotLogDelivery_cabinetId_appLogId_key" ON "CabinetBotLogDelivery"("cabinetId", "appLogId");

-- CreateIndex
CREATE INDEX "CabinetBotLogDelivery_cabinetId_createdAt_idx" ON "CabinetBotLogDelivery"("cabinetId", "createdAt");

-- CreateIndex
CREATE INDEX "CabinetBotLogDelivery_status_createdAt_idx" ON "CabinetBotLogDelivery"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "CabinetTelegramBot" ADD CONSTRAINT "CabinetTelegramBot_cabinetId_fkey" FOREIGN KEY ("cabinetId") REFERENCES "Cabinet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngestEvent" ADD CONSTRAINT "IngestEvent_cabinetId_fkey" FOREIGN KEY ("cabinetId") REFERENCES "Cabinet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignalDraft" ADD CONSTRAINT "SignalDraft_targetCabinetId_fkey" FOREIGN KEY ("targetCabinetId") REFERENCES "Cabinet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CabinetBotLogDelivery" ADD CONSTRAINT "CabinetBotLogDelivery_cabinetId_fkey" FOREIGN KEY ("cabinetId") REFERENCES "Cabinet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CabinetBotLogDelivery" ADD CONSTRAINT "CabinetBotLogDelivery_appLogId_fkey" FOREIGN KEY ("appLogId") REFERENCES "AppLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;
