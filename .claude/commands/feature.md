# Feature: Diseño + Implementación + Verificación en navegador + Revisión + Documentación

Orquesta a los tres agentes del proyecto (`architecto`, `desarrollador`, `revisor`, definidos en
`.claude/agents/`) para implementar un requerimiento nuevo, verifica el resultado en un navegador
real y deja `docs/` actualizado al final.

Sigue este flujo en orden. No saltes fases. Cada fase depende del resultado de la anterior, así que
invoca cada agente y espera su resultado antes de continuar (no lances los tres en paralelo).

Requerimiento: $ARGUMENTS

---

## Fase 1 — Arquitectura

Invoca el agente `architecto` (Task tool, `subagent_type: "architecto"`) pasándole en el prompt:

* El requerimiento completo (`$ARGUMENTS`).
* Instrucción de leer `CLAUDE.md`, `docs/arquitectura.md` y `docs/requerimientos.md` antes de
  diseñar (el agente ya tiene esto en sus instrucciones, pero repite el requerimiento igual).

El agente devuelve el diseño técnico completo (resumen funcional, componentes afectados, modelo de
datos, endpoints, validaciones, seguridad, plan de implementación) y una sección de preguntas
abiertas.

Muestra el diseño completo al usuario. Si hay preguntas abiertas, pregúntaselas ahora.

**Detente aquí y pregunta al usuario si aprueba el diseño o quiere ajustes.** No continúes a la Fase
2 sin aprobación explícita.

## Fase 2 — Implementación

Solo después de que el usuario apruebe el diseño de la Fase 1.

Invoca el agente `desarrollador` (Task tool, `subagent_type: "desarrollador"`) pasándole en el
prompt:

* El diseño técnico completo aprobado en la Fase 1 (texto completo, no un resumen).
* El requerimiento original.
* Instrucción de seguir `CLAUDE.md` y correr react-doctor (scoped) antes y después de sus cambios si
  el diseño afecta componentes React (ya está en sus instrucciones, pero recuérdaselo si el diseño
  toca `app/` o componentes).

El agente devuelve: archivos modificados/creados, explicación de los cambios, resultado de
react-doctor si aplica, y riesgos encontrados.

## Fase 3 — Verificación funcional en navegador (Playwright)

Ejecuta esta fase tú directamente (no es un subagente): de los cuatro roles del flujo, eres el único
con acceso a las herramientas de Playwright (`mcp__playwright__*`). Ni `desarrollador` ni `revisor`
las tienen en su `tools:`, a propósito, para no mezclar "implementar"/"revisar código" con "conducir
un navegador".

**Cuándo se salta:** si el requerimiento no toca `app/`, páginas, componentes ni comportamiento
visible en el navegador (p. ej. un cambio interno a un caso de uso sin efecto en la UI), sáltala y
dilo explícitamente al pasar a la Fase 4, en vez de forzar una prueba que no verificaría nada nuevo.

1. **Levanta el servidor de desarrollo** si no está corriendo ya: revisa primero si el puerto 3613
   está en escucha (evita el `EADDRINUSE` de levantar un segundo proceso) y solo entonces
   `npm run dev` en segundo plano.
2. **Recorre el camino feliz de la funcionalidad nueva** con las herramientas de Playwright
   (`browser_navigate`, `browser_click`, `browser_type`, `browser_snapshot`, etc.), como lo haría la
   persona usuaria real. Si el flujo requiere sesión: para el perfil ADMIN usa el RUT `14212602-8`
   con la contraseña de `ADMIN_SEED_PASSWORD` (`.env`, sembrada por `scripts/seed-admin.ts`); para
   NOTIFICADOR_RPC no hay usuario sembrado por defecto — pide credenciales de prueba al usuario o
   créalas con el mantenedor de usuarios si ya está disponible.
3. **Prueba también el borde relevante al requerimiento** (un error de validación, un estado vacío,
   un 401/403), no solo el camino feliz.
4. **Si algo falla o no coincide con el diseño aprobado en la Fase 1:** no avances a la Fase 4.
   Reporta con precisión qué se probó y qué salió mal (una captura con `browser_take_screenshot` o
   `browser_snapshot` ayuda) y vuelve a la Fase 2 (nueva invocación de `desarrollador` con la
   corrección pedida); repite la Fase 3 cuando la corrección esté lista.
5. Si el comportamiento coincide con el diseño aprobado, continúa a la Fase 4.

Esta fase no reemplaza `npx tsc --noEmit` / `npm run lint` / `npm run build` de la Fase 4: esos
verifican tipos y build; esta verifica que la funcionalidad funcione de punta a punta en el
navegador.

## Fase 4 — Revisión de código

Ejecuta esta fase inmediatamente después de la Fase 3, sin esperar confirmación del usuario.

Invoca el agente `revisor` (Task tool, `subagent_type: "revisor"`) pasándole en el prompt:

* El diseño aprobado en la Fase 1.
* Los archivos modificados/creados y la explicación de cambios de la Fase 2.
* El resultado de la verificación en navegador de la Fase 3 (qué se probó y el resultado), o la nota
  de que se saltó por no aplicar.
* Instrucción de correr `npx tsc --noEmit`, `npm run lint` y `npm run build` (obligatorio, ya está
  en sus instrucciones) — un fallo ahí es crítico por sí solo.

Muestra al usuario el resultado completo: problemas críticos, problemas importantes, mejoras
recomendadas, código sugerido, puntuación por categoría y veredicto (APROBADO / APROBADO CON
OBSERVACIONES / RECHAZADO).

Si el veredicto es **RECHAZADO** o hay problemas críticos: indica exactamente qué debe corregirse,
**no avances a la Fase 5**, y espera a que el desarrollador (nueva invocación de la Fase 2 con las
correcciones pedidas) resuelva los problemas — repite la Fase 3 si el cambio afecta lo ya verificado
en el navegador — y el revisor vuelva a aprobar.

## Fase 5 — Actualización de documentación

Ejecuta esta fase solo si el veredicto de la Fase 4 fue APROBADO o APROBADO CON OBSERVACIONES.

Esta fase la ejecutas tú directamente (no es un subagente) porque necesitas el contexto completo de
las fases anteriores. Actualiza, según corresponda:

* **`docs/requerimientos.md`** — agrega el requerimiento nuevo a la tabla de "Implementados" (o
  actualiza su estado si ya existía como pendiente), con un ID correlativo (siguiente `RF-XX`
  disponible) y una nota breve. Actualiza la fecha de "Última actualización".
* **`docs/arquitectura.md`** — si el requerimiento introdujo un módulo, capa, patrón o decisión de
  diseño nueva que no estaba documentada, agrégala en la sección correspondiente. Si no hubo cambios
  arquitectónicos, no toques este archivo.
* **`docs/resumen-tecnico.md`** — si el requerimiento agregó una dependencia, un comando de
  `package.json`, una variable de entorno o cambió el estado de un módulo (p. ej. de "stub" a
  "implementado"), actualízalo. Si no hubo cambios técnicos relevantes, no toques este archivo.

No inventes contenido: actualiza solo lo que efectivamente cambió en esta implementación. Termina
confirmando al usuario qué archivos de `docs/` se actualizaron (o que ninguno lo necesitaba).
