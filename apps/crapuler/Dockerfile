FROM node:22-alpine

WORKDIR /app

COPY server.mjs ./
COPY app.js ./
COPY index.html ./
COPY styles.css ./
COPY data/ ./data/
COPY scripts/ ./scripts/

EXPOSE 4317

CMD ["node", "server.mjs"]
