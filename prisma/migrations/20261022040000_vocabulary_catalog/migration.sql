-- La categoría por paciente pasa a llamarse ProfileCategory; "Category" queda para el catálogo (spec 105 FR-005).
ALTER TABLE "Category" RENAME TO "ProfileCategory";
ALTER TABLE "ProfileCategory" RENAME CONSTRAINT "Category_pkey" TO "ProfileCategory_pkey";
ALTER TABLE "ProfileCategory" RENAME CONSTRAINT "Category_profileId_fkey" TO "ProfileCategory_profileId_fkey";
ALTER INDEX "Category_profileId_idx" RENAME TO "ProfileCategory_profileId_idx";

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pictogram" (
    "id" TEXT NOT NULL,
    "arasaacId" INTEGER,
    "label" TEXT NOT NULL,
    "imagePath" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Pictogram_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CategoryPictogram" (
    "categoryId" TEXT NOT NULL,
    "pictogramId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,

    CONSTRAINT "CategoryPictogram_pkey" PRIMARY KEY ("categoryId","pictogramId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Category_name_key" ON "Category"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Pictogram_arasaacId_key" ON "Pictogram"("arasaacId");

-- CreateIndex
CREATE INDEX "Pictogram_label_idx" ON "Pictogram"("label");

-- CreateIndex
CREATE INDEX "CategoryPictogram_pictogramId_idx" ON "CategoryPictogram"("pictogramId");

-- AddForeignKey
ALTER TABLE "CategoryPictogram" ADD CONSTRAINT "CategoryPictogram_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoryPictogram" ADD CONSTRAINT "CategoryPictogram_pictogramId_fkey" FOREIGN KEY ("pictogramId") REFERENCES "Pictogram"("id") ON DELETE CASCADE ON UPDATE CASCADE;
