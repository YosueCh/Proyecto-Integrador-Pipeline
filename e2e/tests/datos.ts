// Credenciales del administrador sembrado por el backend (se pueden cambiar con variables de entorno).
export const ADMIN_USER = process.env.ADMIN_USER || 'admin';
export const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Admin123!';

// Sufijo unico por ejecucion para no chocar con datos de corridas anteriores
export const unico = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
