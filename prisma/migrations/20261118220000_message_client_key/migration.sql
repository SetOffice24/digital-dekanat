-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "clientKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Message_authorId_clientKey_key" ON "Message"("authorId", "clientKey");

