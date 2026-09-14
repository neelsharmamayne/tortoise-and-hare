FROM node:22-alpine
WORKDIR /app/server
COPY server/package*.json ./
RUN npm install --omit=dev
COPY . /app
ENV DATA_DIR=/app/server/data
EXPOSE 3000
CMD ["node", "server.js"]
