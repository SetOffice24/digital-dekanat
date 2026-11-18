-- Помощник для всех ролей: владелец чата — пользователь (userId), а не только студент.
-- Существующие чаты студентов получают userId их аккаунта, затем столбец становится обязательным.

-- AlterTable
ALTER TABLE "AiChat" ADD COLUMN     "userId" TEXT,
ALTER COLUMN "studentId" DROP NOT NULL;

UPDATE "AiChat" c SET "userId" = s."userId" FROM "Student" s WHERE s."id" = c."studentId";
DELETE FROM "AiChat" WHERE "userId" IS NULL;
ALTER TABLE "AiChat" ALTER COLUMN "userId" SET NOT NULL;

-- AlterTable
ALTER TABLE "AiMessage" ADD COLUMN     "links" JSONB,
ALTER COLUMN "studentId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "AiChat_userId_updatedAt_idx" ON "AiChat"("userId", "updatedAt");

-- AddForeignKey
ALTER TABLE "AiChat" ADD CONSTRAINT "AiChat_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
