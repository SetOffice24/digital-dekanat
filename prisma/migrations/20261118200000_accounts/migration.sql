-- CreateEnum
CREATE TYPE "AccountAction" AS ENUM ('CREATED', 'BLOCKED', 'UNBLOCKED', 'PASSWORD_RESET', 'PASSWORD_CHANGED', 'TRANSFERRED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "blockReason" TEXT,
ADD COLUMN     "blockedAt" TIMESTAMP(3),
ADD COLUMN     "lastLoginAt" TIMESTAMP(3),
ADD COLUMN     "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "AccountEvent" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "action" "AccountAction" NOT NULL,
    "details" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AccountEvent_studentId_createdAt_idx" ON "AccountEvent"("studentId", "createdAt");

-- CreateIndex
CREATE INDEX "AccountEvent_createdAt_idx" ON "AccountEvent"("createdAt");

-- AddForeignKey
ALTER TABLE "AccountEvent" ADD CONSTRAINT "AccountEvent_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountEvent" ADD CONSTRAINT "AccountEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

