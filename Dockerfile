# ALV SPORT — imagen para Railway (Next.js standalone + pnpm)
# Los NEXT_PUBLIC_* se inyectan en BUILD: configura las variables del
# servicio en Railway ANTES del primer deploy.

FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

FROM base AS deps
# pnpm-workspace.yaml trae onlyBuiltDependencies (sharp, esbuild, oxide):
# sin él, pnpm 10 bloquea los postinstall y Tailwind no compila.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_VAPID_PUBLIC_KEY
ARG NEXT_PUBLIC_SITE_URL
RUN pnpm build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
