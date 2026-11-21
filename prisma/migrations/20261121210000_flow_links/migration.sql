-- AlterTable
ALTER TABLE "Exam" ADD COLUMN     "enrollmentId" TEXT,
ADD COLUMN     "requestId" TEXT,
ADD COLUMN     "resultAt" TIMESTAMP(3),
ADD COLUMN     "studentId" TEXT,
ADD COLUMN     "teacherId" TEXT;

-- AlterTable
ALTER TABLE "Grade" ADD COLUMN     "authorUserId" TEXT,
ADD COLUMN     "requestId" TEXT,
ADD COLUMN     "submissionId" TEXT;

-- AlterTable
ALTER TABLE "RequestDocument" ADD COLUMN     "replacedAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "Exam_requestId_key" ON "Exam"("requestId");

-- CreateIndex
CREATE INDEX "Exam_studentId_idx" ON "Exam"("studentId");

-- CreateIndex
CREATE INDEX "Exam_teacherId_idx" ON "Exam"("teacherId");

-- CreateIndex
CREATE UNIQUE INDEX "Grade_submissionId_key" ON "Grade"("submissionId");

-- AddForeignKey
ALTER TABLE "Grade" ADD CONSTRAINT "Grade_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Grade" ADD CONSTRAINT "Grade_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Exam" ADD CONSTRAINT "Exam_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Exam" ADD CONSTRAINT "Exam_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Exam" ADD CONSTRAINT "Exam_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE SET NULL ON UPDATE CASCADE;

