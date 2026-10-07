const path = require('node:path');
const { openDatabase } = require('./src/db');
const { createApp } = require('./src/app');
const { createSocketServer } = require('./src/socketServer');

// Configuracion por variables de entorno (asi Docker puede cambiarlas sin tocar codigo)
const port = Number(process.env.PORT) || 3000;
const socketPort = Number(process.env.SOCKET_PORT) || 6061;
const dataDir = process.env.DATA_DIR || path.join(__dirname, 'data');

const db = openDatabase(dataDir);
const app = createApp({ db, backupDir: path.join(dataDir, 'backups') });

const server = app.listen(port, () => {
  console.log(`API escuchando en http://localhost:${port}  (datos en ${dataDir})`);
});

// Mismo contenedor, mismo proceso: un segundo servidor con el protocolo
// {insert:<element>} / {get:<element>} sobre TCP crudo (no HTTP).
const socketServer = createSocketServer(db, server);
socketServer.listen(socketPort, () => {
  console.log(`Socket TCP escuchando en el puerto ${socketPort}`);
});

// "docker stop" envia SIGTERM: cerramos ambos servidores y la BD de forma ordenada
function shutdown() {
  server.close(() => {
    socketServer.close(() => {
      db.close();
      process.exit(0);
    });
  });
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
