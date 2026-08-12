-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateTable
CREATE TABLE "MessageEmbedding" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "sender" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "embedding" vector(768),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageEmbedding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MessageEmbedding_messageId_key" ON "MessageEmbedding"("messageId");

-- AddForeignKey
ALTER TABLE "MessageEmbedding" ADD CONSTRAINT "MessageEmbedding_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "WhatsappSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
