export function normalizarRut(rut: string): string {
  return rut.replace(/[.\s]/g, "").toUpperCase();
}

export function calcularDigitoVerificador(cuerpo: string): string {
  let suma = 0;
  let multiplicador = 2;

  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += Number(cuerpo[i]) * multiplicador;
    multiplicador = multiplicador === 7 ? 2 : multiplicador + 1;
  }

  const resto = 11 - (suma % 11);
  if (resto === 11) return "0";
  if (resto === 10) return "K";
  return String(resto);
}

// Variante tolerante para validar RUT dentro de archivos reportados (regla `RUT_VALIDO`), NO para
// el login (que sigue usando `esRutValido`, más estricta). Acepta con o sin puntos y guion
// ("12.345.678-5", "12345678-5", "123456785"), cuerpo de 1 a 8 dígitos y DV "k" minúscula.
// Sin guion, el último carácter se toma como dígito verificador.
export function esRutValidoFlexible(rut: string): boolean {
  const compacto = rut.replace(/[.\s-]/g, "").toUpperCase();
  const coincidencia = /^(\d{1,8})([\dK])$/.exec(compacto);

  if (!coincidencia) {
    return false;
  }

  // Un guion, si viene, debe estar justo antes del dígito verificador ("1234-5678" no es un RUT).
  const sinPuntos = rut.replace(/[.\s]/g, "");
  const posicionGuion = sinPuntos.indexOf("-");
  if (posicionGuion !== -1 && posicionGuion !== sinPuntos.length - 2) {
    return false;
  }

  const [, cuerpo, digitoVerificador] = coincidencia;
  return calcularDigitoVerificador(cuerpo) === digitoVerificador;
}

export function esRutValido(rutConGuion: string): boolean {
  const rut = normalizarRut(rutConGuion);
  const coincidencia = /^(\d{7,8})-([\dK])$/.exec(rut);

  if (!coincidencia) {
    return false;
  }

  const [, cuerpo, digitoVerificador] = coincidencia;
  return calcularDigitoVerificador(cuerpo) === digitoVerificador;
}
