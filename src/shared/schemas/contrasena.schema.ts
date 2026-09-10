import { z } from "zod";

// Reglas de contraseña y de email compartidas por todo el sistema. Viven en `shared/` y no en
// un módulo porque las consumen `modules/usuarios/` (mantenedor), `modules/auth/`
// (recuperación) y los componentes de `shared/components/`: tenerlas dentro de un módulo
// obligaba a `shared/` a importar de `modules/`, invirtiendo el flujo de dependencias.

// Texto único para las reglas de complejidad: el proyecto muestra solo `issues[0].message`,
// así que separar los mensajes obligaría al operador a corregir la contraseña a cuentagotas.
export const MENSAJE_COMPLEJIDAD_CONTRASENA =
  "La contraseña debe tener al menos 8 caracteres e incluir una mayúscula, una minúscula y un número.";

const MENSAJE_TOPE_CONTRASENA = "La contraseña es demasiado larga. Usa menos caracteres, sobre todo si incluye tildes o eñes.";
// Exportado para que el aviso en vivo del formulario use exactamente el mismo texto que el
// error de validación, y no aparezcan dos redacciones distintas para el mismo problema.
export const MENSAJE_CONFIRMACION_CONTRASENA = "Las contraseñas no coinciden.";
export const MENSAJE_COINCIDENCIA_CONTRASENA = "Las contraseñas coinciden.";

const LARGO_MINIMO_CONTRASENA = 8;
// bcrypt trunca en 72 BYTES, no en 72 caracteres: con tildes o eñes 72 caracteres los superan
// y el resto se descartaría en silencio.
const MAXIMO_BYTES_CONTRASENA = 72;

const codificadorUtf8 = new TextEncoder();

// Fuente única de las reglas de complejidad: la validación del servidor y la lista que el
// formulario muestra en vivo recorren este mismo arreglo, así no pueden divergir. Si se agrega
// una regla aquí, el checklist la refleja solo.
export const REGLAS_CONTRASENA = [
  {
    id: "largo",
    etiqueta: `Al menos ${LARGO_MINIMO_CONTRASENA} caracteres`,
    cumple: (contrasena: string) => contrasena.length >= LARGO_MINIMO_CONTRASENA,
  },
  {
    id: "mayuscula",
    etiqueta: "Una letra mayúscula",
    cumple: (contrasena: string) => /[A-Z]/.test(contrasena),
  },
  {
    id: "minuscula",
    etiqueta: "Una letra minúscula",
    cumple: (contrasena: string) => /[a-z]/.test(contrasena),
  },
  {
    id: "digito",
    etiqueta: "Un número",
    cumple: (contrasena: string) => /\d/.test(contrasena),
  },
] as const;

function cumpleComplejidad(contrasena: string): boolean {
  return REGLAS_CONTRASENA.every((regla) => regla.cumple(contrasena));
}

// Sin `.trim()`: recortar espacios alteraría la contraseña que el operador realmente tecleó.
export const contrasenaSchema = z
  .string()
  .refine(cumpleComplejidad, MENSAJE_COMPLEJIDAD_CONTRASENA)
  .refine(
    (contrasena) => codificadorUtf8.encode(contrasena).length <= MAXIMO_BYTES_CONTRASENA,
    MENSAJE_TOPE_CONTRASENA,
  );

// El UNIQUE de PostgreSQL distingue mayúsculas, así que el email se normaliza siempre
// (creación y edición) para que "A@x.cl" y "a@x.cl" no convivan como cuentas distintas. Lo
// mismo vale al buscar la cuenta en la recuperación: sin el `toLowerCase`,
// "Persona@redsalud.gob.cl" no encontraría su propia fila.
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email("Ingresa un email válido"));
