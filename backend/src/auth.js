const crypto = require('node:crypto');

// Autenticacion sin dependencias externas: contrasenas con scrypt y tokens
// firmados con HMAC-SHA256 (formato JWT: encabezado.carga.firma).

const b64 = (data) => Buffer.from(data).toString('base64url');

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 32).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  const candidate = crypto.scryptSync(password, salt, 32);
  const real = Buffer.from(hash, 'hex');
  return candidate.length === real.length && crypto.timingSafeEqual(candidate, real);
}

function signToken(payload, secret, ttlSeconds = 8 * 3600) {
  const header = b64(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds }));
  const sig = crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${sig}`;
}

// Devuelve la carga del token o null si la firma es invalida o ya expiro.
function verifyToken(token, secret) {
  const partes = String(token).split('.');
  if (partes.length !== 3) return null;
  const [header, body, sig] = partes;
  const esperada = crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest();
  const recibida = Buffer.from(sig, 'base64url');
  if (esperada.length !== recibida.length || !crypto.timingSafeEqual(esperada, recibida)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    return payload.exp > Date.now() / 1000 ? payload : null;
  } catch {
    return null;
  }
}

module.exports = { hashPassword, verifyPassword, signToken, verifyToken };
