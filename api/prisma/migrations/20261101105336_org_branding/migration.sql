-- AlterTable
ALTER TABLE "CompanySettings" ADD COLUMN     "accentColor" TEXT NOT NULL DEFAULT '#36b3e6',
ADD COLUMN     "brandColor" TEXT NOT NULL DEFAULT '#3a5ce0',
ADD COLUMN     "cornerStyle" TEXT NOT NULL DEFAULT 'rounded',
ADD COLUMN     "defaultTheme" TEXT NOT NULL DEFAULT 'system',
ADD COLUMN     "logoDataUrl" TEXT,
ADD COLUMN     "productName" TEXT NOT NULL DEFAULT 'PayTrack HRMS';
