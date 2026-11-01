/*
  Warnings:

  - You are about to drop the column `genre` on the `songs` table. All the data in the column will be lost.
  - You are about to drop the `categories` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `song_categories` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE `song_categories` DROP FOREIGN KEY `song_categories_category_id_fkey`;

-- DropForeignKey
ALTER TABLE `song_categories` DROP FOREIGN KEY `song_categories_song_id_fkey`;

-- AlterTable
ALTER TABLE `songs` DROP COLUMN `genre`;

-- DropTable
DROP TABLE `categories`;

-- DropTable
DROP TABLE `song_categories`;

-- CreateTable
CREATE TABLE `classifications` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `type` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,

    INDEX `classifications_type_idx`(`type`),
    UNIQUE INDEX `classifications_type_slug_key`(`type`, `slug`),
    UNIQUE INDEX `classifications_type_name_key`(`type`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `song_classifications` (
    `song_id` INTEGER NOT NULL,
    `classification_id` INTEGER NOT NULL,

    INDEX `song_classifications_classification_id_idx`(`classification_id`),
    PRIMARY KEY (`song_id`, `classification_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `song_classifications` ADD CONSTRAINT `song_classifications_song_id_fkey` FOREIGN KEY (`song_id`) REFERENCES `songs`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `song_classifications` ADD CONSTRAINT `song_classifications_classification_id_fkey` FOREIGN KEY (`classification_id`) REFERENCES `classifications`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
