## Railway production Dockerfile — build context is the repo root.
## Docker Compose uses backend/Dockerfile (context = ./backend) unchanged.

FROM node:20-alpine

WORKDIR /app

COPY backend/package*.json ./
RUN npm install --omit=dev

COPY backend/server.js ./
COPY backend/src/     ./src/

EXPOSE 3000

CMD ["node", "server.js"]
