// Escapa los cinco caracteres con significado especial en HTML. Se usa para interpolar datos
// de usuario (nombres, valores de placeholders) dentro de un fragmento HTML ya armado por el
// servidor, sin volver a parsear ni sanitizar todo el documento por un solo valor.
//
// Vivía duplicado a nivel de módulo (originalmente solo en
// `modules/auth/infrastructure/email/PasswordResetMailer.ts`); se centraliza aquí porque ahora lo
// reutiliza también `modules/ventanas-carga/domain/entities/PlantillaAlerta.ts`, que no puede
// depender de infraestructura de otro módulo.
export function escaparHtml(valor: string): string {
  return valor
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
