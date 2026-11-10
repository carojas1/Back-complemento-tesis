-- Logo of each center. Only the path in the bucket; the file is validated before it is stored.
ALTER TABLE "CenterSettings" ADD COLUMN "logoPath" TEXT;
