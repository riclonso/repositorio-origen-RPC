import type { User } from "@/modules/auth/domain/entities/User";
import type { ContextoEnlace } from "@/modules/auth/domain/entities/PasswordResetToken";

export interface VerificadorContrasena {
  verificar(contrasena: string, hash: string): Promise<boolean>;
}

export interface EmisorSesion {
  emitir(usuario: Pick<User, "id" | "perfilCodigo" | "sesionVersion">): Promise<string>;
}

// `application/` nunca importa bcrypt: la política de hasheo del proyecto (12 rondas) entra
// por este puerto.
export interface HasheadorContrasena {
  hashear(contrasena: string): Promise<string>;
}

// Genera el token en claro y su digest. El caso de uso recibe ambos, entrega el digest al
// repositorio y el claro al correo; ni uno ni otro salen por ningún otro camino.
export interface GeneradorTokenRecuperacion {
  generar(): { token: string; tokenHash: string };
  // Reduce un token recibido a su digest para buscarlo. La comparación la hace PostgreSQL a
  // través del índice único, así que ningún digest se compara en JavaScript.
  hashear(token: string): string;
}

// Opciones del correo del enlace. Solo afectan el texto (título/copy y la vigencia mostrada) y
// el parámetro `?contexto` de la URL: el comportamiento de seguridad es idéntico en ambos casos.
export type OpcionesEnlaceContrasena = {
  horasVigencia: number;
  contexto: ContextoEnlace;
};

export interface EnviadorCorreoRecuperacion {
  // `false` cuando el relay SMTP no está configurado. Es el único punto donde el caso de uso
  // pregunta por la disponibilidad del correo, sin saber nada de SMTP.
  disponible(): boolean;
  enviar(
    destinatario: { email: string; nombres: string },
    token: string,
    opciones: OpcionesEnlaceContrasena,
  ): Promise<void>;
}
