import type { PasswordResetToken } from "@/modules/auth/domain/entities/PasswordResetToken";

// Resultado del consumo. El caso de uso no puede distinguir por qué falló: token inexistente,
// vencido, ya usado, invalidado o cuenta desactivada colapsan en el mismo `ok: false`, con la
// única excepción de CUENTA_INACTIVA, que se separa solo para poder auditarla. La respuesta
// HTTP es idéntica en ambos casos.
export type ResultadoConsumoToken =
  | { ok: true; usuarioId: string; usuarioRut: string }
  | { ok: false; motivo: "TOKEN_INVALIDO" | "CUENTA_INACTIVA" };

// Datos de emisión de un token. El cupo por cuenta viaja aquí y NO se comprueba antes de
// llamar: contar en una consulta y después insertar en otra es un TOCTOU que se evade con
// peticiones simultáneas (una ráfaga concurrente emitía un token por petición, no tres). La
// comprobación es responsabilidad de la MISMA sentencia que inserta.
export type EmisionToken = {
  usuarioId: string;
  tokenHash: string;
  expiraEn: Date;
  // Inicio de la ventana móvil del cupo: solo cuentan las filas creadas después de este
  // instante.
  inicioVentana: Date;
  maximoPorCuenta: number;
};

export interface PasswordResetTokenRepository {
  // Crea el token y, en la misma transacción, purga las filas antiguas de ese usuario. El hash
  // entra como argumento y no vuelve en el resultado.
  //
  // Devuelve `null` —sin crear nada— cuando la cuenta ya agotó su cupo en la ventana. La
  // decisión la toma la base de datos dentro de la sentencia de inserción, así que dos
  // peticiones simultáneas no pueden pasar ambas por el hueco.
  crear(datos: EmisionToken): Promise<PasswordResetToken | null>;

  // Marca un token concreto como invalidado. Se usa cuando el envío del correo falla: nadie
  // recibió una copia, así que dejarlo vigente no aporta nada.
  invalidar(id: string): Promise<void>;

  // Reclamo atómico del token más el cambio de contraseña, todo en una transacción. Devuelve
  // `ok: false` sin efecto alguno si el token no estaba vigente o la cuenta ya no puede
  // iniciar sesión.
  consumir(tokenHash: string, contrasenaHash: string): Promise<ResultadoConsumoToken>;
}
