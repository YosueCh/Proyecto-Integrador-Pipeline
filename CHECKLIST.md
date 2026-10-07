# Checklist - Proyecto Integrador (CI/CD)

Leyenda: [x] hecho | [ ] pendiente | (Cap) = tomar captura para el reporte

## A. Desarrollo y calidad de codigo (20%)
- [x] A1. API REST con al menos 6 endpoints (actual: 15 / 6)
  - [x] Base heredada de la Practica 5 (14 endpoints)
  - [x] GET /api/health
  - [x] (Cap) Respuesta de /api/health
- [x] A2. Pruebas automatizadas
  - [x] Jest + Supertest instalados (81 pruebas)
  - [x] Pruebas para /api/health y para repo.js
  - [x] Cobertura configurada con umbral minimo 70% (coverageThreshold)
  - [x] (Cap) Tabla de cobertura en terminal
- [x] A3. Contenedorizacion
  - [x] Dockerfile optimizado (probado: build + healthy)
  - [x] .dockerignore (node_modules, .env, logs, etc.)
  - [x] (Cap) docker build y docker run local

## B. Integracion continua - GitHub Actions (40%)
- [x] B1. Repositorio en GitHub creado y codigo subido
- [x] B2. .github/workflows/main.yml en push / pull_request a main
- [x] B3. El pipeline ejecuta pruebas y muestra resumen de cobertura en logs
- [x] B4. Login seguro en Docker Hub con Personal Access Token
- [x] B5. Build y tags :latest y :${{ github.sha }}
- [x] B6. Imagen publicada en Docker Hub
- [x] (Cap) Pipeline en verde, logs de cobertura, imagen en Docker Hub

## C. Despliegue continuo - AWS EC2 (20%)
- [x] C1. Instancia EC2 Ubuntu Server con Docker instalado
- [x] C2. Security Group: puerto 22 (SSH) y puerto 80 (HTTP)
- [ ] C3. GitHub Actions conectado por SSH con .pem
- [ ] C4. Deploy: pull de Docker Hub, detener contenedor viejo, levantar nuevo en puerto 80
- [ ] C5. Seguridad: sin contrasenas/IPs/tokens/llaves en el codigo (todo en GitHub Secrets)
  - [ ] Secrets cargados (DOCKERHUB_USERNAME, DOCKERHUB_TOKEN, EC2_HOST, EC2_USER, EC2_SSH_KEY)
- [ ] (Cap) Instancia, Security Group, Secrets (valores ocultos), log del deploy

## Entregables
- [ ] E1. Repositorio GitHub: codigo, main.yml, Dockerfile, .dockerignore
- [ ] E2. README.md: arquitectura, comandos locales, pasos de configuracion
- [ ] E3. URL publica: http://<IP_EC2>/api/... respondiendo
- [ ] E4. Demo en vivo: git push -> tests -> Docker Hub -> servidor actualizado
  - [ ] (Cap) Antes y despues del cambio

## Reporte PDF (20%)
- [ ] R1. Portada institucional (LaTeX)
- [ ] R2. Introduccion de al menos 1 pagina completa
- [ ] R3. Resultados con figuras numeradas, explicando proceso y resultados
- [ ] R4. Conclusion de al menos 2 parrafos
- [ ] R5. Al menos 3 fuentes de informacion
- [ ] R6. Formato de la rubrica de investigacion, texto justificado
