import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { crearUsuario } from "../src/modules/usuarios/application/use-cases/CrearUsuario";
import { emitirEnlaceContrasena } from "../src/modules/auth/application/use-cases/EmitirEnlaceContrasena";
import type { User } from "../src/modules/auth/domain/entities/User";
import type { Usuario } from "../src/modules/usuarios/domain/entities/Usuario";

const usuarioBase: User = {
  id: randomUUID(),
  nombres: "Ana",
  apellidos: "Prueba",
  rut: "11111111-1",
  email: "ana@example.invalid",
  username: "11111111-1",
  contrasenaHash: null,
  perfilCodigo: "NOTIFICADOR_RPC",
  activo: true,
  createdAt: new Date(),
};

async function probarAltaSinContrasena() {
  let datosPersistidos: { contrasenaHash: string | null } | null = null;

  const resultado = await crearUsuario(
    {
      nombres: usuarioBase.nombres,
      apellidos: usuarioBase.apellidos,
      rut: usuarioBase.rut,
      email: usuarioBase.email,
      perfilCodigo: usuarioBase.perfilCodigo,
      formatosExcelIds: [],
    },
    {
      repositorioPerfiles: {
        listar: async () => [],
        buscarPorCodigo: async () => null,
        existeActivo: async () => true,
      },
      repositorio: {
        listar: async () => ({ filas: [], total: 0 }),
        obtenerPorId: async () => null,
        buscarConflicto: async () => null,
        contarAdminsActivos: async () => 1,
        crear: async (datos) => {
          datosPersistidos = datos;
          return {
            ...datos,
            id: usuarioBase.id,
            perfilNombre: "Notificador RPC",
            tieneContrasena: false,
            createdAt: usuarioBase.createdAt,
            formatosExcel: [],
          } satisfies Usuario;
        },
        actualizar: async () => {
          throw new Error("No esperado");
        },
        cambiarEstado: async () => {
          throw new Error("No esperado");
        },
        actualizarContrasena: async () => {
          throw new Error("No esperado");
        },
      },
      repositorioFormatosExcel: {
        listar: async () => [],
        estaAsignadoYActivo: async () => false,
        listarAsignadosAUsuario: async () => [],
        obtenerPorId: async () => null,
        existeActivo: async () => true,
        obtenerActivosEntre: async () => [],
        crear: async () => {
          throw new Error("No esperado");
        },
        actualizar: async () => {
          throw new Error("No esperado");
        },
        cambiarEstado: async () => {
          throw new Error("No esperado");
        },
        buscarPorNombre: async () => null,
        obtenerPlantilla: async () => null,
        contarNotificadoresAsignadosActivosPorFormato: async () => ({}),
      },
    },
  );

  assert.equal(resultado.ok, true);
  assert.ok(datosPersistidos);
  assert.equal((datosPersistidos as { contrasenaHash: string | null }).contrasenaHash, null);
}

async function probarEnlaceDeActivacion() {
  let contextoCorreo: string | null = null;
  let horasEmitidas = 0;

  const resultado = await emitirEnlaceContrasena(usuarioBase.id, {
    repositorioUsuarios: {
      buscarPorRut: async () => null,
      buscarPorEmail: async () => null,
      buscarPorId: async () => usuarioBase,
    },
    generadorToken: {
      generar: () => ({ token: "token-claro", tokenHash: "hash" }),
      hashear: (token) => token,
    },
    repositorioTokens: {
      crear: async () => null,
      emitirParaAdmin: async (datos) => {
        horasEmitidas = Math.round((datos.expiraEn.getTime() - Date.now()) / 3_600_000);
        return {
          id: randomUUID(),
          usuarioId: datos.usuarioId,
          expiraEn: datos.expiraEn,
          usadoEn: null,
          invalidadoEn: null,
          createdAt: new Date(),
        };
      },
      invalidar: async () => undefined,
      consumir: async () => ({ ok: false, motivo: "TOKEN_INVALIDO" }),
    },
    enviadorCorreo: {
      disponible: () => true,
      enviar: async (_destinatario, _token, opciones) => {
        contextoCorreo = opciones.contexto;
      },
    },
  });

  assert.equal(resultado.estado, "ENVIADO");
  assert.equal(contextoCorreo, "activacion");
  assert.equal(horasEmitidas, 8);
}

async function probarFalloDeEnvioInvalidaToken() {
  let invalidado: string | null = null;
  const tokenId = randomUUID();

  const resultado = await emitirEnlaceContrasena(usuarioBase.id, {
    repositorioUsuarios: {
      buscarPorRut: async () => null,
      buscarPorEmail: async () => null,
      buscarPorId: async () => ({ ...usuarioBase, contrasenaHash: "hash-anterior" }),
    },
    generadorToken: {
      generar: () => ({ token: "token-claro", tokenHash: "hash" }),
      hashear: (token) => token,
    },
    repositorioTokens: {
      crear: async () => null,
      emitirParaAdmin: async (datos) => ({
        id: tokenId,
        usuarioId: datos.usuarioId,
        expiraEn: datos.expiraEn,
        usadoEn: null,
        invalidadoEn: null,
        createdAt: new Date(),
      }),
      invalidar: async (id) => {
        invalidado = id;
      },
      consumir: async () => ({ ok: false, motivo: "TOKEN_INVALIDO" }),
    },
    enviadorCorreo: {
      disponible: () => true,
      enviar: async () => {
        throw Object.assign(new Error("Relay rechazó a ana@example.invalid"), {
          code: "EAUTH",
        });
      },
    },
  });

  assert.equal(resultado.estado, "ENVIO_FALLIDO");
  assert.equal(invalidado, tokenId);
  if (resultado.estado === "ENVIO_FALLIDO") {
    assert.ok(resultado.diagnostico.includes("[correo]"));
    assert.ok(!resultado.diagnostico.includes(usuarioBase.email));
  }
}

async function main() {
  await probarAltaSinContrasena();
  await probarEnlaceDeActivacion();
  await probarFalloDeEnvioInvalidaToken();
  console.log("OK: alta pendiente, enlace de 8 horas y manejo de fallo SMTP");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
