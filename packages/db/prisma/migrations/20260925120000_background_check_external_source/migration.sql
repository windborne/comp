-- Background checks kept in step with an external provider (e.g. Checkr).
ALTER TABLE "background_check_requests"
  ADD COLUMN "externalProvider" TEXT,
  ADD COLUMN "externalCandidateId" TEXT,
  ADD COLUMN "externalReportId" TEXT;

CREATE INDEX "background_check_requests_organizationId_externalProvider_idx"
  ON "background_check_requests"("organizationId", "externalProvider");
