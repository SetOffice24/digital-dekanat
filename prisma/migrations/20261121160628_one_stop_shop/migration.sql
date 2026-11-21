-- CreateEnum
CREATE TYPE "Department" AS ENUM ('DEANERY', 'ACCOUNTING', 'DORM', 'IT');

-- CreateEnum
CREATE TYPE "ApprovalKind" AS ENUM ('TEACHER', 'DEPARTMENT');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('WAITING', 'PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "DocKind" AS ENUM ('PASSPORT', 'SNILS', 'INN', 'MED_086', 'FLUORO', 'MEDICAL', 'BANK', 'MILITARY', 'OTHER');

-- CreateEnum
CREATE TYPE "DocStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "CaseStatus" AS ENUM ('OPEN', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('BOOKED', 'DONE', 'NO_SHOW', 'CANCELLED');

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'OFFICE';

-- AlterTable
ALTER TABLE "Certificate" ADD COLUMN     "revokeReason" TEXT,
ADD COLUMN     "revokedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Request" ADD COLUMN     "autoIssued" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "caseId" TEXT,
ADD COLUMN     "dueAt" TIMESTAMP(3),
ADD COLUMN     "escalatedAt" TIMESTAMP(3),
ADD COLUMN     "ratedAt" TIMESTAMP(3),
ADD COLUMN     "rating" INTEGER,
ADD COLUMN     "ratingComment" TEXT;

-- AlterTable
ALTER TABLE "RequestType" ADD COLUMN     "autoIssue" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "department" "Department" NOT NULL DEFAULT 'DEANERY',
ADD COLUMN     "docs" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "enabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "route" JSONB NOT NULL DEFAULT '[]';

-- CreateTable
CREATE TABLE "OfficeStaff" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "department" "Department" NOT NULL,

    CONSTRAINT "OfficeStaff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequestApproval" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "idx" INTEGER NOT NULL,
    "kind" "ApprovalKind" NOT NULL,
    "department" "Department",
    "teacherId" TEXT,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'WAITING',
    "comment" TEXT,
    "decidedByUserId" TEXT,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "RequestApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentDocument" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "kind" "DocKind" NOT NULL,
    "fileName" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "validUntil" TIMESTAMP(3),
    "status" "DocStatus" NOT NULL DEFAULT 'PENDING',
    "reviewNote" TEXT,
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequestDocument" (
    "requestId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,

    CONSTRAINT "RequestDocument_pkey" PRIMARY KEY ("requestId","documentId")
);

-- CreateTable
CREATE TABLE "SituationCase" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" "CaseStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "SituationCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaseStep" (
    "caseId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "doneAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,

    CONSTRAINT "CaseStep_pkey" PRIMARY KEY ("caseId","key")
);

-- CreateTable
CREATE TABLE "Appointment" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "department" "Department" NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "purpose" TEXT NOT NULL,
    "requestId" TEXT,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'BOOKED',
    "slotKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OfficeStaff_userId_key" ON "OfficeStaff"("userId");

-- CreateIndex
CREATE INDEX "RequestApproval_teacherId_status_idx" ON "RequestApproval"("teacherId", "status");

-- CreateIndex
CREATE INDEX "RequestApproval_department_status_idx" ON "RequestApproval"("department", "status");

-- CreateIndex
CREATE UNIQUE INDEX "RequestApproval_requestId_idx_key" ON "RequestApproval"("requestId", "idx");

-- CreateIndex
CREATE UNIQUE INDEX "StudentDocument_storageKey_key" ON "StudentDocument"("storageKey");

-- CreateIndex
CREATE INDEX "StudentDocument_studentId_kind_idx" ON "StudentDocument"("studentId", "kind");

-- CreateIndex
CREATE INDEX "SituationCase_studentId_status_idx" ON "SituationCase"("studentId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Appointment_slotKey_key" ON "Appointment"("slotKey");

-- CreateIndex
CREATE INDEX "Appointment_department_startsAt_idx" ON "Appointment"("department", "startsAt");

-- CreateIndex
CREATE INDEX "Appointment_studentId_startsAt_idx" ON "Appointment"("studentId", "startsAt");

-- CreateIndex
CREATE INDEX "Request_caseId_idx" ON "Request"("caseId");

-- AddForeignKey
ALTER TABLE "Request" ADD CONSTRAINT "Request_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "SituationCase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfficeStaff" ADD CONSTRAINT "OfficeStaff_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestApproval" ADD CONSTRAINT "RequestApproval_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestApproval" ADD CONSTRAINT "RequestApproval_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentDocument" ADD CONSTRAINT "StudentDocument_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestDocument" ADD CONSTRAINT "RequestDocument_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestDocument" ADD CONSTRAINT "RequestDocument_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "StudentDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SituationCase" ADD CONSTRAINT "SituationCase_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseStep" ADD CONSTRAINT "CaseStep_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "SituationCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request"("id") ON DELETE SET NULL ON UPDATE CASCADE;

