-- Единое окно — только деканат. Аккаунты отделов (бухгалтерия, студгородок, ИТ) не удаляем — на них ссылается история заявок:
-- блокируем, завершаем сессии и переводим в роль без кабинета (профиля сотрудника деканата у них нет — доступа не будет).
DELETE FROM "Session" WHERE "userId" IN (SELECT "id" FROM "User" WHERE "role" = 'OFFICE');
UPDATE "User" SET "role" = 'STAFF', "blockedAt" = COALESCE("blockedAt", CURRENT_TIMESTAMP), "blockReason" = 'Кабинет отдела упразднён: единое окно ведёт деканат' WHERE "role" = 'OFFICE';

-- AlterEnum
BEGIN;
CREATE TYPE "Role_new" AS ENUM ('STUDENT', 'STAFF', 'TEACHER');
ALTER TABLE "User" ALTER COLUMN "role" TYPE "Role_new" USING ("role"::text::"Role_new");
ALTER TYPE "Role" RENAME TO "Role_old";
ALTER TYPE "Role_new" RENAME TO "Role";
DROP TYPE "public"."Role_old";
COMMIT;

-- DropForeignKey
ALTER TABLE "OfficeStaff" DROP CONSTRAINT "OfficeStaff_userId_fkey";

-- DropIndex
DROP INDEX "Appointment_department_startsAt_idx";

-- DropIndex
DROP INDEX "RequestApproval_department_status_idx";

-- AlterTable
ALTER TABLE "Appointment" DROP COLUMN "department";

-- AlterTable
ALTER TABLE "RequestApproval" DROP COLUMN "department",
DROP COLUMN "kind";

-- AlterTable
ALTER TABLE "RequestType" DROP COLUMN "department";

-- DropTable
DROP TABLE "OfficeStaff";

-- DropEnum
DROP TYPE "ApprovalKind";

-- DropEnum
DROP TYPE "Department";

-- CreateIndex
CREATE INDEX "Appointment_startsAt_idx" ON "Appointment"("startsAt");

