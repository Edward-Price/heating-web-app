FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
COPY apps/api ./apps/api

RUN npm ci --omit=dev

ENV API_PORT=3001
EXPOSE 3001

CMD ["node", "apps/api/src/server.js"]
