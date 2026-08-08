-- CreateEnum
CREATE TYPE "InputMethod" AS ENUM ('MANUAL', 'OCR');

-- AlterTable
ALTER TABLE "FuelEntry" ADD COLUMN     "inputMethod" "InputMethod" NOT NULL DEFAULT 'MANUAL';

-- AlterTable
ALTER TABLE "UtilityBill" ADD COLUMN     "inputMethod" "InputMethod" NOT NULL DEFAULT 'MANUAL';
