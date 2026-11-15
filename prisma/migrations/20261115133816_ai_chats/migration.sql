/*
  Warnings:

  - Added the required column `chatId` to the `AiMessage` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "AiMessage" ADD COLUMN     "chatId" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "AiChat" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiChat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiChat_studentId_updatedAt_idx" ON "AiChat"("studentId", "updatedAt");

-- CreateIndex
CREATE INDEX "AiMessage_chatId_createdAt_idx" ON "AiMessage"("chatId", "createdAt");

-- AddForeignKey
ALTER TABLE "AiChat" ADD CONSTRAINT "AiChat_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiMessage" ADD CONSTRAINT "AiMessage_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "AiChat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
