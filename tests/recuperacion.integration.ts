import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { prisma } from '../src/infrastructure/database/prisma';
import { prismaPasswordResetTokenRepository as tokens } from '../src/modules/auth/infrastructure/repositories/PrismaPasswordResetTokenRepository';
import { prismaUsuarioRepository as usuarios } from '../src/modules/usuarios/infrastructure/repositories/PrismaUsuarioRepository';
import { extraerIp } from '../src/shared/utils/peticion';

async function main() {
  const url = new URL(process.env.DATABASE_URL!);
  assert.ok(['localhost','127.0.0.1'].includes(url.hostname), 'Solo BD local desechable');
  assert.equal(process.env.RF10_TEST_DATABASE, 'true', 'Requiere autorización de BD desechable');
  const id = randomUUID();
  const digest = () => createHash('sha256').update(randomUUID()).digest('hex');
  try {
    await prisma.usuario.create({data:{id,nombres:'Prueba',apellidos:'RF10',rut:id,email:`${id}@example.invalid`,username:id,contrasenaHash:'original',perfilCodigo:'ADMIN'}});
    const emitir = () => tokens.crear({usuarioId:id,tokenHash:digest(),expiraEn:new Date(Date.now()+7200000),inicioVentana:new Date(Date.now()-3600000),maximoPorCuenta:3});
    const rafaga = await Promise.all(Array.from({length:40},emitir));
    assert.equal(rafaga.filter(Boolean).length,3);
    console.log('OK: 40 solicitudes concurrentes producen exactamente 3 tokens');
    await prisma.tokenRecuperacion.deleteMany({where:{usuarioId:id}});
    const zona = await prisma.$queryRaw<Array<{TimeZone:string}>>`SHOW TIME ZONE`;
    const vencido = digest();
    await prisma.tokenRecuperacion.create({data:{usuarioId:id,tokenHash:vencido,createdAt:new Date(Date.now()-10800000),expiraEn:new Date(Date.now()-3600000)}});
    assert.equal((await tokens.consumir(vencido,'no-debe-guardarse')).ok,false);
    console.log('OK: token vencido rechazado; zona del servidor', zona[0].TimeZone);
    await prisma.tokenRecuperacion.deleteMany({where:{usuarioId:id}});
    const hash=digest();
    await prisma.tokenRecuperacion.create({data:{usuarioId:id,tokenHash:hash,expiraEn:new Date(Date.now()+7200000)}});
    const consumo = await Promise.all([tokens.consumir(hash,'nueva'),tokens.consumir(hash,'nueva')]);
    assert.equal(consumo.filter(r=>r.ok).length,1);
    const hermano=digest();
    await prisma.tokenRecuperacion.create({data:{usuarioId:id,tokenHash:hermano,expiraEn:new Date(Date.now()+7200000)}});
    await usuarios.actualizarContrasena(id,'admin-nueva');
    assert.equal((await tokens.consumir(hermano,'no')).ok,false);
    const inactivo=digest();
    await prisma.tokenRecuperacion.create({data:{usuarioId:id,tokenHash:inactivo,expiraEn:new Date(Date.now()+7200000)}});
    await prisma.usuario.update({where:{id},data:{activo:false}});
    assert.equal((await tokens.consumir(inactivo,'no')).ok,false);
    assert.equal((await prisma.usuario.findUniqueOrThrow({where:{id}})).contrasenaHash,'admin-nueva');
    console.log('OK: uso único, invalidación por administrador y cuenta inactiva');
    process.env.TRUST_PROXY='false';
    assert.equal(extraerIp(new Request('http://localhost',{headers:{'x-forwarded-for':'9.9.9.9'}})),null);
    process.env.TRUST_PROXY='true';
    assert.equal(extraerIp(new Request('http://localhost',{headers:{'x-forwarded-for':'9.9.9.9, 192.0.2.1'}})),'192.0.2.1');
    console.log('OK: cabecera ignorada sin proxy autorizado; último salto con proxy');
  } finally {
    await prisma.usuario.deleteMany({where:{id}});
    await prisma.$disconnect();
  }
}
main().catch(e=>{console.error(e);process.exitCode=1});
