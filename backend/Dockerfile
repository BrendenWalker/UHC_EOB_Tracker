FROM node:20.19.4-alpine3.21

ARG VERSION=dev
ENV VERSION=$VERSION

WORKDIR /app

# Install deps at /app so common/database/db-config.js can resolve pg, dotenv, etc.
COPY common ./common
COPY backend/package*.json ./

RUN npm install --production

COPY backend ./backend

WORKDIR /app/backend

EXPOSE 80

CMD ["node", "server.js"]
