# --- зависимости ---
FROM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY prisma ./prisma
RUN pnpm install --frozen-lockfile

# --- сборка ---
FROM node:22-alpine AS build
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
RUN corepack enable
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm exec prisma generate && pnpm build

# --- запуск ---
FROM node:22-alpine AS run
RUN apk add --no-cache openssl
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup -S app && adduser -S app -G app
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
# prisma CLI + сид для миграций и первичного заполнения
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/package.json ./package.json
# файлы материалов и домашних заданий (том uploads в docker-compose)
RUN mkdir -p /app/data/uploads && chown -R app:app /app/data
ENV DATA_DIR=/app/data
USER app
EXPOSE 3000
CMD ["node", "server.js"]
