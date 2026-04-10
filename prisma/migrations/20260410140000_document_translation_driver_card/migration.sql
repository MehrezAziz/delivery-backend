-- CreateEnum value DRIVER_CARD (PostgreSQL)
ALTER TYPE "DocumentType" ADD VALUE 'DRIVER_CARD';

-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "translation_locale" TEXT,
ADD COLUMN     "translation_data" JSONB;

-- CreateTable
CREATE TABLE "driver_cards" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "classification" TEXT NOT NULL,

    CONSTRAINT "driver_cards_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "driver_cards_document_id_key" ON "driver_cards"("document_id");

-- AddForeignKey
ALTER TABLE "driver_cards" ADD CONSTRAINT "driver_cards_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
