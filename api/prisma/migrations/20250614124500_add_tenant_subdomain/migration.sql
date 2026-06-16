-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN "subdomain" TEXT;

UPDATE "Tenant" t
SET "subdomain" = LOWER(u."username")
FROM "User" u
WHERE u."tenantId" = t."id";

UPDATE "Tenant"
SET "subdomain" = "id"
WHERE "subdomain" IS NULL;

ALTER TABLE "Tenant" ALTER COLUMN "subdomain" SET NOT NULL;

CREATE UNIQUE INDEX "Tenant_subdomain_key" ON "Tenant"("subdomain");
