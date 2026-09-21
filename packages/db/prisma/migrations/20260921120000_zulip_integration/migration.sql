-- Per-organization Zulip bot used to mirror email notifications as Zulip
-- direct messages. Additive: no existing tables change.

-- CreateTable
CREATE TABLE "zulip_integration" (
    "id" TEXT NOT NULL DEFAULT generate_prefixed_cuid('zul'::text),
    "organizationId" TEXT NOT NULL,
    "siteUrl" TEXT NOT NULL,
    "botEmail" TEXT NOT NULL,
    "botApiKey" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "zulip_integration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "zulip_integration_organizationId_key" ON "zulip_integration"("organizationId");

-- AddForeignKey
ALTER TABLE "zulip_integration" ADD CONSTRAINT "zulip_integration_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
