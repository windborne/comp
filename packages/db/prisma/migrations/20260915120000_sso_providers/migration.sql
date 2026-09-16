-- Single sign-on (OIDC) providers registered per organization, read by the
-- @better-auth/sso plugin at sign-in time. Column names follow better-auth's
-- expected schema. Additive: no existing tables change.

-- CreateTable
CREATE TABLE "sso_provider" (
    "id" TEXT NOT NULL DEFAULT generate_prefixed_cuid('sso'::text),
    "providerId" TEXT NOT NULL,
    "issuer" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "domainVerified" BOOLEAN NOT NULL DEFAULT false,
    "oidcConfig" TEXT,
    "samlConfig" TEXT,
    "userId" TEXT,
    "organizationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sso_provider_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sso_provider_providerId_key" ON "sso_provider"("providerId");

-- CreateIndex
CREATE INDEX "sso_provider_organizationId_idx" ON "sso_provider"("organizationId");

-- CreateIndex
CREATE INDEX "sso_provider_domain_idx" ON "sso_provider"("domain");

-- CreateIndex
CREATE INDEX "sso_provider_userId_idx" ON "sso_provider"("userId");

-- AddForeignKey
ALTER TABLE "sso_provider" ADD CONSTRAINT "sso_provider_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sso_provider" ADD CONSTRAINT "sso_provider_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

