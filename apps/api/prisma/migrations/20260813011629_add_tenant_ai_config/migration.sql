-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "aiApiKey" TEXT,
ADD COLUMN     "aiBaseUrl" TEXT,
ADD COLUMN     "aiChatModel" TEXT,
ADD COLUMN     "aiEmbeddingModel" TEXT,
ADD COLUMN     "aiProvider" TEXT NOT NULL DEFAULT 'gemini';
