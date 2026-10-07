# Imagen base: Node 22 sobre Debian "slim" (mas compatible que Alpine con modulos nativos)
FROM node:22-slim

# Carpeta de trabajo dentro del contenedor
WORKDIR /app

# Se copian primero solo los package*.json: mientras no cambien las
# dependencias, Docker reutiliza la capa en cache y el build es mucho mas rapido
COPY package*.json ./
# --ignore-scripts: better-sqlite3 ya incluye su binario precompilado; sin esta
# opcion npm 10 intenta compilarlo con node-gyp (requiere Python y g++) y falla
RUN npm ci --omit=dev --ignore-scripts

# Ahora si, el codigo de la aplicacion
COPY server.js ./
COPY src ./src

# Configuracion: la API HTTP escucha en el puerto 80 (-p 8080:80) y el
# socket TCP {insert}/{get} en el 6061 (-p 6061:6061); la BD vive en /app/data
ENV NODE_ENV=production \
    PORT=80 \
    SOCKET_PORT=6061 \
    DATA_DIR=/app/data

# Carpeta de datos con permisos para el usuario sin privilegios "node"
RUN mkdir -p /app/data && chown -R node:node /app/data

# No ejecutar como root: buena practica de seguridad
USER node

EXPOSE 80 6061

# Docker marca el contenedor como "healthy" solo si /api/health responde
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
