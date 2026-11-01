-- AlterTable
ALTER TABLE `songs` ADD COLUMN `deletion_pending` BOOLEAN NOT NULL DEFAULT false;
