const net = require('node:net');
const { ValidationError, insertarElemento, obtenerElementos } = require('./repo');

// Protocolo de texto plano sobre TCP, un comando por linea (terminada en \n):
//   {insert:<element>}   element = el mismo JSON que usan los POST de la API
//   {get:<element>}      element = { "tabla": "libros|autores|categorias", "id"?: <entero> }
// La respuesta usa el mismo esquema que la API HTTP: { statusCode, data, message? }
const COMANDO_RE = /^\{(insert|get):([\s\S]*)\}$/;

function parseComando(linea) {
  const texto = linea.trim();
  const match = texto.match(COMANDO_RE);
  if (!match) {
    throw new ValidationError('Formato invalido. Use {insert:<element>} o {get:<element>}');
  }
  const [, comando, jsonTexto] = match;
  let payload;
  try {
    payload = JSON.parse(jsonTexto);
  } catch {
    throw new ValidationError('<element> debe ser JSON valido');
  }
  return { comando, payload };
}

function respuesta(statusCode, data, message) {
  return message === undefined ? { statusCode, data } : { statusCode, data, message };
}

// Ejecuta una linea {insert:...} / {get:...} y devuelve { statusCode, data, message? }.
function ejecutarComando(db, linea) {
  console.log(`[socket] -> ${linea.trim()}`);
  let resultado;
  try {
    const { comando, payload } = parseComando(linea);

    if (comando === 'insert') {
      const { tabla, registro } = insertarElemento(db, payload);
      resultado = respuesta(201, [{ tabla, ...registro }]);
    } else {
      resultado = respuesta(200, obtenerElementos(db, payload));
    }
  } catch (err) {
    if (err instanceof ValidationError) {
      resultado = respuesta(400, [], err.message);
    } else if (typeof err.code === 'string' && err.code.startsWith('SQLITE_CONSTRAINT')) {
      resultado = respuesta(409, [], 'Conflicto con los datos existentes (duplicado o registro relacionado)');
    } else {
      console.error(err);
      resultado = respuesta(500, [], 'Error interno del servidor');
    }
  }
  const { statusCode, data, message } = resultado;
  console.log(`[socket] <- ${statusCode} ${JSON.stringify(data).slice(0, 200)}${message ? ' ' + message : ''}`);
  return resultado;
}

function manejarLinea(db, socket, linea) {
  if (!linea.trim()) return;
  socket.write(`${JSON.stringify(ejecutarComando(db, linea))}\n`);
}

const HTTP_RE = /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS) /;

// Si se pasa httpServer, el mismo puerto atiende tambien HTTP (p. ej. Postman):
// se mira el primer paquete y, si empieza como una peticion HTTP, la conexion
// se entrega a la API; si no, se usa el protocolo {insert:...}/{get:...}.
function createSocketServer(db, httpServer) {
  const server = net.createServer((socket) => {
    let buffer = '';
    const cliente = `${socket.remoteAddress}:${socket.remotePort}`;
    // Un cliente que cierra la conexion abruptamente no debe tumbar el proceso
    socket.on('error', () => {});

    function atenderTexto(chunk) {
      buffer += chunk;
      let idx;
      while ((idx = buffer.indexOf('\n')) !== -1) {
        const linea = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 1);
        manejarLinea(db, socket, linea);
      }
    }

    socket.once('data', (primero) => {
      if (httpServer && HTTP_RE.test(primero.toString('latin1', 0, 8))) {
        console.log(`[socket] peticion HTTP por el puerto de socket desde ${cliente}`);
        socket.pause();
        socket.unshift(primero);
        httpServer.emit('connection', socket);
        process.nextTick(() => socket.resume());
        return;
      }

      console.log(`[socket] conexion abierta desde ${cliente}`);
      socket.on('close', () => console.log(`[socket] conexion cerrada ${cliente}`));
      socket.setEncoding('utf8');
      atenderTexto(primero.toString('utf8'));
      socket.on('data', atenderTexto);
    });
  });
  return server;
}

module.exports = { createSocketServer, parseComando };
