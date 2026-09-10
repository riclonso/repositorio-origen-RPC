import assert from 'node:assert/strict';
import net from 'node:net';
import { passwordResetMailer } from '../src/modules/auth/infrastructure/email/PasswordResetMailer';

async function main() {
 assert.equal(process.env.SMTP_HOST,'127.0.0.1');
 assert.equal(process.env.SMTP_PORT,'55440');
 const sockets = new Set<net.Socket>();
 let mensaje='';
 const server=net.createServer(socket=>{
  sockets.add(socket); socket.on('close',()=>sockets.delete(socket));
  socket.write('220 localhost test SMTP\r\n');
  let buffer='',datos=false;
  socket.on('data',chunk=>{
   buffer+=chunk.toString();
   let pos;
   while((pos=buffer.indexOf('\r\n'))>=0){
    const linea=buffer.slice(0,pos);buffer=buffer.slice(pos+2);
    if(datos){if(linea==='.') {datos=false;socket.write('250 accepted\r\n')} else mensaje+=linea+'\n';continue}
    if(/^EHLO|^HELO/.test(linea)) socket.write('250 localhost\r\n');
    else if(/^DATA/.test(linea)){datos=true;socket.write('354 continue\r\n')}
    else if(/^QUIT/.test(linea)){socket.end('221 bye\r\n')}
    else socket.write('250 OK\r\n');
   }
  });
 });
 await new Promise<void>(resolve=>server.listen(55440,'127.0.0.1',resolve));
 try {
  await passwordResetMailer.enviar({email:'prueba@example.invalid',nombres:'Ana'},'A'.repeat(43));
  assert.ok(mensaje.includes('recuperar/confirmar'));
  assert.ok(mensaje.includes('intranet.example.invalid'));
  assert.ok(mensaje.includes('text/plain'));
  assert.ok(mensaje.includes('text/html'));
  console.log('OK: correo SMTP capturado localmente con enlace y versiones texto/HTML');
 } finally { for(const s of sockets)s.destroy(); server.close(); }
}
main().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1)});
