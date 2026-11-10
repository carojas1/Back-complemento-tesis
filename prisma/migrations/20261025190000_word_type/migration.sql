-- Tipo de palabra de cada pictograma (acuerdo 2026-10-25). Solo agrega: ningún dato existente cambia; se llena desde
-- ARASAAC con `node dist/scripts/fill-word-types`.
CREATE TYPE "WordType" AS ENUM ('PERSON', 'THING', 'ACTION', 'DESCRIPTOR', 'SOCIAL', 'OTHER');

ALTER TABLE "Pictogram" ADD COLUMN "wordType" "WordType";
