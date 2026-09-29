// Traducción a dominio del aborto de una transacción `Serializable` por conflicto con otra
// escritura concurrente (P2034 en Prisma, SQLSTATE 40001 en PostgreSQL). Permite que
// `application/` responda "vuelve a intentarlo" sin conocer los códigos del ORM.
export class ConflictoConcurrenteError extends Error {
  constructor() {
    super("Otro cambio se aplicó al mismo tiempo");
    this.name = "ConflictoConcurrenteError";
  }
}
