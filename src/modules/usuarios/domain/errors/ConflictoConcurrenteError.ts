// Traducción a dominio del aborto de una transacción `Serializable` de este módulo por conflicto
// con otra escritura concurrente (P2034 en Prisma, SQLSTATE 40001 en PostgreSQL). Permite que
// `application/` responda "vuelve a intentarlo" sin conocer los códigos del ORM.
//
// Es PROPIO de `modules/usuarios/` (decisión explícita): no se importa el homónimo de
// `modules/formatos-excel/` para no acoplar los dominios de ambos módulos entre sí.
export class ConflictoConcurrenteError extends Error {
  constructor() {
    super("Otro cambio se aplicó al mismo tiempo");
    this.name = "ConflictoConcurrenteError";
  }
}
