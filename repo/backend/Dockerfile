FROM node:20-alpine

WORKDIR /app

# Install build deps needed for argon2 native module, then drop them.
RUN apk add --no-cache python3 make g++ \
    && ln -sf python3 /usr/bin/python

COPY package.json package-lock.json* ./
RUN npm ci --omit=optional

COPY src ./src
COPY tests ./tests

RUN apk del python3 make g++ || true

ENV NODE_ENV=production \
    PORT=4000 \
    MONGO_URI=mongodb://mongo:27017/offline_ops_portal

EXPOSE 4000

CMD ["node", "src/server.js"]
