-- Spec 104: catálogo de avatares (imagen en el bucket) y el paciente apunta a uno.
CREATE TABLE "Avatar" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "imagePath" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Avatar_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Avatar_name_key" ON "Avatar"("name");

-- No hay pacientes todavía (tabla vacía al migrar).
ALTER TABLE "Patient" DROP COLUMN "avatar", ADD COLUMN "avatarId" TEXT NOT NULL;
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_avatarId_fkey" FOREIGN KEY ("avatarId") REFERENCES "Avatar"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Spec 105: el pictograma del perfil apunta al del catálogo (imágenes propias o de ARASAAC, en el bucket).
ALTER TABLE "ProfilePictogram" DROP COLUMN "arasaacId", DROP COLUMN "word", ADD COLUMN "pictogramId" TEXT NOT NULL;
ALTER TABLE "ProfilePictogram" ADD CONSTRAINT "ProfilePictogram_pictogramId_fkey" FOREIGN KEY ("pictogramId") REFERENCES "Pictogram"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Spec 002/106: quién condujo la sesión y si entró con su PIN personal.
ALTER TABLE "Session" ADD COLUMN "therapistId" TEXT, ADD COLUMN "therapistVerified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Session" ADD CONSTRAINT "Session_therapistId_fkey" FOREIGN KEY ("therapistId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
