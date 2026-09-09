-- Habilita `unaccent` para que la búsqueda del mantenedor de usuarios ignore las tildes
-- ("munoz" debe encontrar "Muñoz"). Prisma Client no expone esta función en su API de
-- consultas, por eso el listado se resuelve con $queryRaw parametrizado.
CREATE EXTENSION IF NOT EXISTS unaccent;
