ALTER TABLE "Tenant" ADD COLUMN "customDomain" TEXT;

CREATE UNIQUE INDEX "Tenant_customDomain_key" ON "Tenant"("customDomain");
