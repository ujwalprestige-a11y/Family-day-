-- AlterTable
ALTER TABLE "Employee" DROP CONSTRAINT "Employee_pkey",
DROP COLUMN "duplicate_of",
ADD COLUMN     "form_id" TEXT,
ADD COLUMN     "id" TEXT NOT NULL,
ADD CONSTRAINT "Employee_pkey" PRIMARY KEY ("id");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_form_id_key" ON "Employee"("form_id");

-- CreateIndex
CREATE INDEX "Employee_employee_id_idx" ON "Employee"("employee_id");