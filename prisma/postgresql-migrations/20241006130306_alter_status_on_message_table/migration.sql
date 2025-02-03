-- AlterTable
ALTER TABLE "Message"
ALTER COLUMN "status"
SET
    DATA TYPE VARCHAR(30);

ALTER TABLE "Message" ALTER COLUMN "status" SET DEFAULT 'PENDING';

UPDATE "Message" SET "status" = 'PENDING' WHERE "status" IS NULL;