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

export function esRutValido(rutConGuion: string): boolean {
  const rut = normalizarRut(rutConGuion);
  const coincidencia = /^(\d{7,8})-([\dK])$/.exec(rut);

  if (!coincidencia) {
    return false;
  }

  const [, cuerpo, digitoVerificador] = coincidencia;
  return calcularDigitoVerificador(cuerpo) === digitoVerificador;
}
