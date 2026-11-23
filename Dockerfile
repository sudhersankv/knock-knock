# Knock Knock — single Node machine: serves the built client (dist/) and the WebSocket game server.
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=development
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build
ENV PORT=8787
EXPOSE 8787
CMD ["npx", "tsx", "server/kk/index.ts"]
