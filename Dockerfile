# syntax=docker/dockerfile:1

# ---- Stage 1: build the static bundle with Node ------------------------------
FROM node:24-alpine AS build
WORKDIR /app

# Install dependencies first so this layer is cached until the lockfile changes.
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# .dockerignore keeps CSVs, data/, node_modules and dist out of the context,
# so personal data can never be baked into an image layer.
COPY . .
RUN npm test && npm run build

# ---- Stage 2: serve the static files with nginx ------------------------------
FROM nginx:stable-alpine AS runtime

COPY nginx/default.conf /etc/nginx/conf.d/default.conf
COPY nginx/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1
