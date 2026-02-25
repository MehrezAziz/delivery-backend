/*
  Warnings:

  - Added the required column `super_password` to the `super_users` table without a default value. This is not possible if the table is not empty.

*/

-- AlterTable: Add password column to users (nullable for OTP-only users)
ALTER TABLE "users" ADD COLUMN "password" TEXT;

-- AlterTable: Add super_password column to super_users with temporary default
ALTER TABLE "super_users" ADD COLUMN "super_password" TEXT NOT NULL DEFAULT 'temp';

-- Update existing super_users with hashed password (bcrypt hash of "admin123456")
UPDATE "super_users" SET "super_password" = '$2b$10$k7VTzVjYpRI6Hz8cayDGDeWZmINxMxmZ0yPip1/p4aBAbKbbQzuyy';

-- Remove the default value
ALTER TABLE "super_users" ALTER COLUMN "super_password" DROP DEFAULT;
