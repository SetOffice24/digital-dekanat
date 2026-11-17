-- CreateEnum
CREATE TYPE "PhotoStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "Student" ADD COLUMN     "idCode" TEXT;

-- AlterTable
ALTER TABLE "Submission" ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "StudentPhoto" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "status" "PhotoStatus" NOT NULL DEFAULT 'PENDING',
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,

    CONSTRAINT "StudentPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StudentPhoto_storageKey_key" ON "StudentPhoto"("storageKey");

-- CreateIndex
CREATE INDEX "StudentPhoto_studentId_status_idx" ON "StudentPhoto"("studentId", "status");

-- CreateIndex
CREATE INDEX "StudentPhoto_status_idx" ON "StudentPhoto"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Student_idCode_key" ON "Student"("idCode");

-- AddForeignKey
ALTER TABLE "StudentPhoto" ADD CONSTRAINT "StudentPhoto_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

