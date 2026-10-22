import { prisma } from "@/infrastructure/database/prisma";
import {
  esExtensionReglasLlenado,
  type ReglasLlenadoFormato,
} from "@/modules/formatos-excel/domain/entities/ReglasLlenadoFormato";
import type { ReglasLlenadoRepository } from "@/modules/formatos-excel/domain/repositories/ReglasLlenadoRepository";

type FilaReglasLlenado = {
  id: string;
  formatoExcelId: string;
  nombreArchivoOriginal: string;
  extension: string;
  tipoContenido: string;
  rutaArchivo: string;
  tamanoBytes: number;
  sha256: string;
  subidoPorId: string;
  subidoEn: Date;
};

// La extensión la escribe solo este módulo (y la base tiene un CHECK con la misma lista); un valor
// fuera de ella es una fila adulterada, no un dato a tolerar.
function aEntidad(fila: FilaReglasLlenado): ReglasLlenadoFormato {
  if (!esExtensionReglasLlenado(fila.extension)) {
    throw new Error("Extensión de reglas de llenado no reconocida");
  }

  return { ...fila, extension: fila.extension };
}

export const prismaReglasLlenadoRepository: ReglasLlenadoRepository = {
  async formatoExiste(formatoExcelId) {
    const formato = await prisma.formatoExcel.findUnique({ where: { id: formatoExcelId }, select: { id: true } });
    return formato !== null;
  },

  async obtenerPorFormato(formatoExcelId) {
    const fila = await prisma.reglasLlenadoFormato.findUnique({ where: { formatoExcelId } });
    return fila ? aEntidad(fila) : null;
  },

  async obtenerVistaPorFormato(formatoExcelId) {
    const fila = await prisma.reglasLlenadoFormato.findUnique({
      where: { formatoExcelId },
      select: {
        formatoExcelId: true,
        nombreArchivoOriginal: true,
        extension: true,
        tamanoBytes: true,
        subidoEn: true,
        subidoPor: { select: { nombres: true, apellidos: true } },
      },
    });

    if (!fila || !esExtensionReglasLlenado(fila.extension)) return null;

    return {
      formatoExcelId: fila.formatoExcelId,
      nombreArchivoOriginal: fila.nombreArchivoOriginal,
      extension: fila.extension,
      tamanoBytes: fila.tamanoBytes,
      subidoEn: fila.subidoEn,
      subidoPorNombre: `${fila.subidoPor.nombres} ${fila.subidoPor.apellidos}`.trim(),
    };
  },

  async guardar(datos) {
    return prisma.$transaction(async (tx) => {
      // Bloquea la fila del formato: dos subidas simultáneas se serializan y la segunda ve como
      // "anterior" el archivo de la primera (nunca queda un archivo huérfano en disco).
      const bloqueado = await tx.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM "formato_excel" WHERE "id" = ${datos.formatoExcelId} FOR UPDATE`;

      if (bloqueado.length === 0) {
        return { ok: false as const, motivo: "FORMATO_NO_ENCONTRADO" as const };
      }

      const anterior = await tx.reglasLlenadoFormato.findUnique({ where: { formatoExcelId: datos.formatoExcelId } });
      const { formatoExcelId, ...campos } = datos;

      const actual = anterior
        ? await tx.reglasLlenadoFormato.update({ where: { formatoExcelId }, data: campos })
        : await tx.reglasLlenadoFormato.create({ data: datos });

      return { ok: true as const, actual: aEntidad(actual), anterior: anterior ? aEntidad(anterior) : null };
    });
  },

  async eliminar(formatoExcelId) {
    // `deleteMany` + lectura previa en la misma transacción: si otra petición ya la borró, no es error.
    return prisma.$transaction(async (tx) => {
      const fila = await tx.reglasLlenadoFormato.findUnique({ where: { formatoExcelId } });
      if (!fila) return null;

      const { count } = await tx.reglasLlenadoFormato.deleteMany({ where: { id: fila.id } });
      return count === 1 ? aEntidad(fila) : null;
    });
  },
};
