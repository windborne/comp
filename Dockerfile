# =============================================================================
# STAGE 1: Dependencies - Install and cache workspace dependencies
# =============================================================================
FROM oven/bun:1.2.8 AS deps

WORKDIR /app

# Copy workspace configuration
COPY package.json bun.lock ./

# Copy package.json files for every workspace package the built apps resolve,
# directly or transitively. bun needs each one present to satisfy the
# `workspace:*` ranges declared in apps/app, apps/portal and packages/company —
# a missing file fails the install with "failed to resolve" rather than falling
# back to a registry version.
COPY packages/auth/package.json ./packages/auth/
COPY packages/billing/package.json ./packages/billing/
COPY packages/company/package.json ./packages/company/
COPY packages/db/package.json ./packages/db/
COPY packages/kv/package.json ./packages/kv/
COPY packages/ui/package.json ./packages/ui/
COPY packages/email/package.json ./packages/email/
COPY packages/integration-platform/package.json ./packages/integration-platform/
COPY packages/integrations/package.json ./packages/integrations/
COPY packages/utils/package.json ./packages/utils/
COPY packages/tsconfig/package.json ./packages/tsconfig/
COPY packages/analytics/package.json ./packages/analytics/

# Copy app package.json files
COPY apps/app/package.json ./apps/app/
COPY apps/portal/package.json ./apps/portal/

# Install all dependencies
RUN PRISMA_SKIP_POSTINSTALL_GENERATE=true bun install --ignore-scripts

# =============================================================================
# STAGE 2: Ultra-Minimal Migrator - Only Prisma
# =============================================================================
FROM oven/bun:1.2.8 AS migrator

WORKDIR /app

# Copy local Prisma schema and migrations from workspace
COPY packages/db/prisma ./packages/db/prisma

# Create minimal package.json for Prisma runtime (also used by seeder)
RUN echo '{"name":"migrator","type":"module","dependencies":{"prisma":"^6.14.0","@prisma/client":"^6.14.0","@trycompai/db":"^1.3.4","zod":"^3.25.7"}}' > package.json

# Install ONLY Prisma dependencies
RUN bun install

# Ensure Prisma can find migrations relative to the published schema path
# We copy the local migrations into the published package's dist directory
RUN cp -R packages/db/prisma/migrations node_modules/@trycompai/db/dist/

# Run migrations against the combined schema published by @trycompai/db
RUN echo "Running migrations against @trycompai/db combined schema"
CMD ["bunx", "prisma", "migrate", "deploy", "--schema=node_modules/@trycompai/db/dist/schema.prisma"]

# =============================================================================
# STAGE 3: App Builder
# =============================================================================
FROM deps AS app-builder

WORKDIR /app

# Copy all source code needed for build
COPY packages ./packages
COPY apps/app ./apps/app

# turbo.json is required by the workspace package build below.
COPY turbo.json ./

# Bring in node_modules for build and prisma prebuild
COPY --from=deps /app/node_modules ./node_modules

# Pre-combine schemas and generate the Prisma client into
# node_modules/@prisma/client. The deps stage ran `bun install` with
# `--ignore-scripts` so packages/db's postinstall was skipped; we run
# it explicitly here so `next build` can resolve the generated runtime
# + types when it imports @prisma/client.
RUN cd packages/db && node scripts/combine-schemas.js \
                   && node scripts/generate-prisma-client-js.js

# Ensure Next build has required public env at build-time
ARG NEXT_PUBLIC_BETTER_AUTH_URL
ARG NEXT_PUBLIC_PORTAL_URL
ARG NEXT_PUBLIC_POSTHOG_KEY
ARG NEXT_PUBLIC_POSTHOG_HOST
ARG NEXT_PUBLIC_IS_DUB_ENABLED
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_BETTER_AUTH_URL=$NEXT_PUBLIC_BETTER_AUTH_URL \
    NEXT_PUBLIC_PORTAL_URL=$NEXT_PUBLIC_PORTAL_URL \
    NEXT_PUBLIC_POSTHOG_KEY=$NEXT_PUBLIC_POSTHOG_KEY \
    NEXT_PUBLIC_POSTHOG_HOST=$NEXT_PUBLIC_POSTHOG_HOST \
    NEXT_PUBLIC_IS_DUB_ENABLED=$NEXT_PUBLIC_IS_DUB_ENABLED \
    NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_TELEMETRY_DISABLED=1 NODE_ENV=production \
    NEXT_OUTPUT_STANDALONE=true \
    NODE_OPTIONS=--max_old_space_size=6144

# Build the app
# Build the workspace packages the app imports. Their package.json main
# fields point at dist/, which does not exist in a fresh checkout, so without
# this the Next build fails with "Module not found: Can't resolve
# '@trycompai/auth'" (and billing, company). transpilePackages does not help —
# it changes transpilation, not module resolution.
RUN bunx turbo run build --filter=@trycompai/app^...

RUN cd apps/app && SKIP_ENV_VALIDATION=true bun run build:docker

# =============================================================================
# STAGE 4: App Production
# =============================================================================
FROM node:22-alpine AS app

WORKDIR /app

# Copy Next standalone output
COPY --from=app-builder /app/apps/app/.next/standalone ./
COPY --from=app-builder /app/apps/app/.next/static ./apps/app/.next/static
COPY --from=app-builder /app/apps/app/public ./apps/app/public

EXPOSE 3000
CMD ["node", "apps/app/server.js"]

# =============================================================================
# STAGE 5: Portal Builder
# =============================================================================
FROM deps AS portal-builder

WORKDIR /app

# Copy all source code needed for build
COPY packages ./packages
COPY apps/portal ./apps/portal

# turbo.json is required by the workspace package build below.
COPY turbo.json ./

# Bring in node_modules for build and prisma prebuild
COPY --from=deps /app/node_modules ./node_modules

# Pre-combine schemas for portal build
RUN cd packages/db && node scripts/combine-schemas.js
# The portal's prisma/server.ts imports a LOCAL generated client
# (src/generated/prisma), produced by `prisma generate --schema=prisma/schema` —
# a directory whose tracked schema.prisma holds only the generator block, zero
# models. It previously copied the combined schema to a sibling *file*
# (prisma/schema.prisma), which prisma never reads when given the directory, so
# the portal type-checked against a model-less client:
#   Type error: Property 'policy' does not exist on type 'PrismaClient'.
# db:getschema is the repo's own way to populate that directory with the model
# files. (apps/app is unaffected: it imports the global @prisma/client instead.)
RUN cd apps/portal && bun run db:getschema

# Ensure Next build has required public env at build-time
ARG NEXT_PUBLIC_BETTER_AUTH_URL
# The portal's auth client reads NEXT_PUBLIC_API_URL in the browser
# (apps/portal/src/app/lib/auth-client.ts), so it must be baked in here.
# Without it the built portal calls http://localhost:3333 from the user's
# browser and every auth request fails. app-builder already accepts this arg.
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_BETTER_AUTH_URL=$NEXT_PUBLIC_BETTER_AUTH_URL \
    NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_TELEMETRY_DISABLED=1 NODE_ENV=production \
    NEXT_OUTPUT_STANDALONE=true \
    NODE_OPTIONS=--max_old_space_size=6144

# Build the portal
# Same as app-builder: the portal resolves workspace packages from dist/.
RUN bunx turbo run build --filter=@trycompai/portal^...

RUN cd apps/portal && SKIP_ENV_VALIDATION=true bun run build:docker

# =============================================================================
# STAGE 6: Portal Production
# =============================================================================
FROM node:22-alpine AS portal

WORKDIR /app

# Copy Next standalone output for portal
COPY --from=portal-builder /app/apps/portal/.next/standalone ./
COPY --from=portal-builder /app/apps/portal/.next/static ./apps/portal/.next/static
COPY --from=portal-builder /app/apps/portal/public ./apps/portal/public

EXPOSE 3000
CMD ["node", "apps/portal/server.js"]

# (Trigger.dev hosted; no local runner stage)
