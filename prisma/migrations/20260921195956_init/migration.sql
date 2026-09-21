-- CreateEnum
CREATE TYPE "Status" AS ENUM ('not_registered', 'pre_registered', 'walk_in');

-- CreateEnum
CREATE TYPE "Source" AS ENUM ('master', 'walk_in');

-- CreateTable
CREATE TABLE "Employee" (
    "employee_id" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "mobile" TEXT NOT NULL,
    "marital_status" TEXT NOT NULL,
    "family_members" TEXT[],
    "paid_extended" TEXT[],
    "wristbands_total" INTEGER NOT NULL DEFAULT 1,
    "status" "Status" NOT NULL DEFAULT 'not_registered',
    "source" "Source" NOT NULL DEFAULT 'master',
    "edited_fields" JSONB NOT NULL DEFAULT '[]',
    "registered_at" TIMESTAMP(3),
    "needs_review" BOOLEAN NOT NULL DEFAULT false,
    "duplicate_of" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("employee_id")
);

-- CreateIndex
CREATE INDEX "Employee_full_name_idx" ON "Employee"("full_name");
