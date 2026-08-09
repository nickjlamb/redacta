# syntax=docker/dockerfile:1
# Redacta gateway service — build stage.
# Deterministic install (npm ci against the lockfile), TypeScript compiled
# here so the runtime image never needs dev dependencies.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY tsconfig.json ./
COPY src ./src
RUN npm run build \
 && npm prune --omit=dev

# Runtime stage: production node_modules (just @pharmatools/redacta — the
# engine is dependency-free) + compiled JS. No shell tools are needed at
# runtime; alpine is kept for operability (kubectl exec debugging).
FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./

# Run as the unprivileged user node:22-alpine ships with (uid 1000).
# The k8s securityContext re-asserts this; defence in depth either way.
USER node
EXPOSE 8080

# Configuration is environment-only: PORT, REDACTA_SESSIONS,
# REDACTA_SESSION_TTL_MINUTES, REDACTA_MAX_SESSIONS, REDACTA_API_TOKEN,
# REDACTA_MAX_BODY_BYTES, REDACTA_REQUEST_LOGS, REDACTA_SHUTDOWN_GRACE_MS.
# No credentials or data are baked into this image.
CMD ["node", "dist/server.js"]
