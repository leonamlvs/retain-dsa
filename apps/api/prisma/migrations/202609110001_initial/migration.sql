-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "ApplicationState" (
    "id" INTEGER NOT NULL,
    "stateRevision" BIGINT NOT NULL DEFAULT 0,
    "catalogRevision" BIGINT NOT NULL DEFAULT 0,
    "sourceSequence" BIGINT NOT NULL DEFAULT 0,
    "activeConfig" TEXT NOT NULL,
    "lastBusinessAt" TIMESTAMPTZ(3),

    CONSTRAINT "ApplicationState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Configuration" (
    "version" TEXT NOT NULL,
    "parameters" JSONB NOT NULL,
    "contentHash" TEXT NOT NULL,

    CONSTRAINT "Configuration_pkey" PRIMARY KEY ("version")
);

-- CreateTable
CREATE TABLE "ConfigurationActivation" (
    "id" UUID NOT NULL,
    "sequence" BIGINT NOT NULL,
    "activatedAt" TIMESTAMPTZ(3) NOT NULL,
    "version" TEXT NOT NULL,

    CONSTRAINT "ConfigurationActivation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogRevision" (
    "revision" BIGINT NOT NULL,
    "observedAt" TIMESTAMPTZ(3) NOT NULL,
    "acceptedAt" TIMESTAMPTZ(3) NOT NULL,
    "sourceSequence" BIGINT NOT NULL,
    "queryVersion" TEXT NOT NULL,
    "mappingVersion" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,

    CONSTRAINT "CatalogRevision_pkey" PRIMARY KEY ("revision")
);

-- CreateTable
CREATE TABLE "Problem" (
    "id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "providerProblemId" TEXT NOT NULL,
    "frontendId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "difficulty" TEXT NOT NULL,
    "paidOnly" BOOLEAN NOT NULL,
    "available" BOOLEAN NOT NULL,
    "metadataHash" TEXT NOT NULL,
    "lastSyncedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Problem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProblemTag" (
    "problemId" UUID NOT NULL,
    "tag" TEXT NOT NULL,

    CONSTRAINT "ProblemTag_pkey" PRIMARY KEY ("problemId","tag")
);

-- CreateTable
CREATE TABLE "Skill" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL,
    "tags" TEXT[],
    "mappingVersion" TEXT NOT NULL,

    CONSTRAINT "Skill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Curriculum" (
    "id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "lastSyncedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Curriculum_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CurriculumItem" (
    "id" UUID NOT NULL,
    "curriculumId" UUID NOT NULL,
    "problemId" UUID NOT NULL,
    "skillId" UUID NOT NULL,
    "active" BOOLEAN NOT NULL,
    "position" INTEGER,
    "addedAt" TIMESTAMPTZ(3) NOT NULL,
    "removedAt" TIMESTAMPTZ(3),

    CONSTRAINT "CurriculumItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LocalUser" (
    "id" UUID NOT NULL,
    "singleton" INTEGER NOT NULL DEFAULT 1,
    "generation" UUID NOT NULL,
    "sourceSequence" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL,
    "lastResetAt" TIMESTAMPTZ(3),

    CONSTRAINT "LocalUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Decision" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "generation" UUID NOT NULL,
    "sourceSequence" BIGINT NOT NULL,
    "sourceCutoff" BIGINT NOT NULL,
    "evaluatedAt" TIMESTAMPTZ(3) NOT NULL,
    "catalogRevision" BIGINT NOT NULL,
    "configVersion" TEXT NOT NULL,
    "inputs" JSONB NOT NULL,
    "auditOutputs" JSONB NOT NULL,

    CONSTRAINT "Decision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Recommendation" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "generation" UUID NOT NULL,
    "problemId" UUID NOT NULL,
    "skillId" UUID NOT NULL,
    "difficulty" TEXT NOT NULL,
    "issuedAt" TIMESTAMPTZ(3) NOT NULL,
    "issuanceSnapshot" JSONB NOT NULL,
    "admissionBasis" JSONB NOT NULL,
    "decisionId" UUID NOT NULL,
    "status" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "Recommendation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecommendationEvent" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "generation" UUID NOT NULL,
    "sourceSequence" BIGINT NOT NULL,
    "recommendationId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "at" TIMESTAMPTZ(3) NOT NULL,
    "details" JSONB NOT NULL,

    CONSTRAINT "RecommendationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attempt" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "generation" UUID NOT NULL,
    "sourceSequence" BIGINT NOT NULL,
    "recommendationId" UUID NOT NULL,
    "problemId" UUID NOT NULL,
    "skillId" UUID NOT NULL,
    "difficulty" TEXT NOT NULL,
    "historicalSnapshot" JSONB NOT NULL,
    "completedAt" TIMESTAMPTZ(3) NOT NULL,
    "completedLocalDate" DATE NOT NULL,
    "timezone" TEXT NOT NULL,
    "durationSeconds" INTEGER,
    "idempotencyKey" TEXT NOT NULL,
    "canonicalPayload" JSONB NOT NULL,
    "configVersion" TEXT NOT NULL,

    CONSTRAINT "Attempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttemptFeedback" (
    "attemptId" UUID NOT NULL,
    "independence" TEXT NOT NULL,
    "recognition" TEXT NOT NULL,
    "implementation" TEXT NOT NULL,
    "complexity" TEXT NOT NULL,
    "scoreUnits" INTEGER NOT NULL,
    "appliedCap" TEXT NOT NULL,
    "rating" TEXT NOT NULL,
    "feedbackVersion" TEXT NOT NULL,
    "scorerVersion" TEXT NOT NULL,
    "memoryTransition" JSONB NOT NULL,

    CONSTRAINT "AttemptFeedback_pkey" PRIMARY KEY ("attemptId")
);

-- CreateTable
CREATE TABLE "SkillMemoryState" (
    "userId" UUID NOT NULL,
    "skillId" UUID NOT NULL,
    "difficulty" TEXT NOT NULL,
    "state" JSONB NOT NULL,

    CONSTRAINT "SkillMemoryState_pkey" PRIMARY KEY ("userId","skillId","difficulty")
);

-- CreateTable
CREATE TABLE "UserProblemState" (
    "userId" UUID NOT NULL,
    "problemId" UUID NOT NULL,
    "firstCompletedAt" TIMESTAMPTZ(3) NOT NULL,
    "lastCompletedAt" TIMESTAMPTZ(3) NOT NULL,
    "completionCount" INTEGER NOT NULL,
    "cooldownUntil" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "UserProblemState_pkey" PRIMARY KEY ("userId","problemId")
);

-- CreateTable
CREATE TABLE "DiscoveryState" (
    "fingerprint" TEXT NOT NULL,
    "skillId" UUID NOT NULL,
    "difficulty" TEXT NOT NULL,
    "criteria" JSONB NOT NULL,
    "scanId" UUID NOT NULL,
    "offset" INTEGER NOT NULL,
    "observedIds" TEXT[],
    "previousTotal" INTEGER,
    "startedAt" TIMESTAMPTZ(3) NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "exhausted" BOOLEAN NOT NULL,

    CONSTRAINT "DiscoveryState_pkey" PRIMARY KEY ("fingerprint")
);

-- CreateTable
CREATE TABLE "SupplyCertificate" (
    "id" UUID NOT NULL,
    "skillId" UUID NOT NULL,
    "difficulty" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "scanId" UUID NOT NULL,
    "catalogRevision" BIGINT NOT NULL,
    "observedAt" TIMESTAMPTZ(3) NOT NULL,
    "validUntil" TIMESTAMPTZ(3) NOT NULL,
    "providerIds" TEXT[],
    "evidence" JSONB NOT NULL,

    CONSTRAINT "SupplyCertificate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkRequest" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "generation" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "requestedAt" TIMESTAMPTZ(3) NOT NULL,
    "nextRunAt" TIMESTAMPTZ(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL,
    "details" JSONB NOT NULL,

    CONSTRAINT "WorkRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ConfigurationActivation_sequence_key" ON "ConfigurationActivation"("sequence");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogRevision_sourceSequence_key" ON "CatalogRevision"("sourceSequence");

-- CreateIndex
CREATE UNIQUE INDEX "Problem_provider_providerProblemId_key" ON "Problem"("provider", "providerProblemId");

-- CreateIndex
CREATE INDEX "ProblemTag_tag_idx" ON "ProblemTag"("tag");

-- CreateIndex
CREATE UNIQUE INDEX "Skill_slug_key" ON "Skill"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Curriculum_provider_slug_key" ON "Curriculum"("provider", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "CurriculumItem_curriculumId_problemId_skillId_key" ON "CurriculumItem"("curriculumId", "problemId", "skillId");

-- CreateIndex
CREATE UNIQUE INDEX "LocalUser_singleton_key" ON "LocalUser"("singleton");

-- CreateIndex
CREATE UNIQUE INDEX "LocalUser_generation_key" ON "LocalUser"("generation");

-- CreateIndex
CREATE UNIQUE INDEX "Decision_userId_generation_sourceSequence_key" ON "Decision"("userId", "generation", "sourceSequence");

-- CreateIndex
CREATE INDEX "Recommendation_userId_status_position_idx" ON "Recommendation"("userId", "status", "position");

-- CreateIndex
CREATE UNIQUE INDEX "RecommendationEvent_userId_generation_sourceSequence_key" ON "RecommendationEvent"("userId", "generation", "sourceSequence");

-- CreateIndex
CREATE UNIQUE INDEX "Attempt_recommendationId_key" ON "Attempt"("recommendationId");

-- CreateIndex
CREATE INDEX "Attempt_userId_completedLocalDate_idx" ON "Attempt"("userId", "completedLocalDate");

-- CreateIndex
CREATE UNIQUE INDEX "Attempt_userId_generation_idempotencyKey_key" ON "Attempt"("userId", "generation", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "Attempt_userId_generation_sourceSequence_key" ON "Attempt"("userId", "generation", "sourceSequence");

-- CreateIndex
CREATE INDEX "WorkRequest_status_nextRunAt_idx" ON "WorkRequest"("status", "nextRunAt");

-- AddForeignKey
ALTER TABLE "ConfigurationActivation" ADD CONSTRAINT "ConfigurationActivation_version_fkey" FOREIGN KEY ("version") REFERENCES "Configuration"("version") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProblemTag" ADD CONSTRAINT "ProblemTag_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CurriculumItem" ADD CONSTRAINT "CurriculumItem_curriculumId_fkey" FOREIGN KEY ("curriculumId") REFERENCES "Curriculum"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CurriculumItem" ADD CONSTRAINT "CurriculumItem_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CurriculumItem" ADD CONSTRAINT "CurriculumItem_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Decision" ADD CONSTRAINT "Decision_userId_fkey" FOREIGN KEY ("userId") REFERENCES "LocalUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Decision" ADD CONSTRAINT "Decision_catalogRevision_fkey" FOREIGN KEY ("catalogRevision") REFERENCES "CatalogRevision"("revision") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Decision" ADD CONSTRAINT "Decision_configVersion_fkey" FOREIGN KEY ("configVersion") REFERENCES "Configuration"("version") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recommendation" ADD CONSTRAINT "Recommendation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "LocalUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recommendation" ADD CONSTRAINT "Recommendation_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recommendation" ADD CONSTRAINT "Recommendation_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recommendation" ADD CONSTRAINT "Recommendation_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "Decision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecommendationEvent" ADD CONSTRAINT "RecommendationEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "LocalUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecommendationEvent" ADD CONSTRAINT "RecommendationEvent_recommendationId_fkey" FOREIGN KEY ("recommendationId") REFERENCES "Recommendation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attempt" ADD CONSTRAINT "Attempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "LocalUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attempt" ADD CONSTRAINT "Attempt_recommendationId_fkey" FOREIGN KEY ("recommendationId") REFERENCES "Recommendation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attempt" ADD CONSTRAINT "Attempt_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attempt" ADD CONSTRAINT "Attempt_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attempt" ADD CONSTRAINT "Attempt_configVersion_fkey" FOREIGN KEY ("configVersion") REFERENCES "Configuration"("version") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttemptFeedback" ADD CONSTRAINT "AttemptFeedback_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "Attempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkillMemoryState" ADD CONSTRAINT "SkillMemoryState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "LocalUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkillMemoryState" ADD CONSTRAINT "SkillMemoryState_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserProblemState" ADD CONSTRAINT "UserProblemState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "LocalUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserProblemState" ADD CONSTRAINT "UserProblemState_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscoveryState" ADD CONSTRAINT "DiscoveryState_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplyCertificate" ADD CONSTRAINT "SupplyCertificate_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplyCertificate" ADD CONSTRAINT "SupplyCertificate_catalogRevision_fkey" FOREIGN KEY ("catalogRevision") REFERENCES "CatalogRevision"("revision") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkRequest" ADD CONSTRAINT "WorkRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "LocalUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Constraints supplement generated Prisma DDL; no business-rule triggers.
ALTER TABLE "ApplicationState" ADD CONSTRAINT "application_singleton" CHECK (id = 1);
ALTER TABLE "LocalUser" ADD CONSTRAINT "user_singleton" CHECK (singleton = 1);
ALTER TABLE "Attempt" ADD CONSTRAINT "attempt_duration_nonnegative" CHECK ("durationSeconds" IS NULL OR "durationSeconds" >= 0);
ALTER TABLE "AttemptFeedback" ADD CONSTRAINT "feedback_score_range" CHECK ("scoreUnits" BETWEEN 0 AND 100000000);
ALTER TABLE "Recommendation" ADD CONSTRAINT "recommendation_position_nonnegative" CHECK (position >= 0);
ALTER TABLE "Recommendation" ADD CONSTRAINT "recommendation_status" CHECK (status IN ('ACTIVE', 'COMPLETED', 'REPLACED', 'INVALIDATED'));
ALTER TABLE "UserProblemState" ADD CONSTRAINT "completion_count_positive" CHECK ("completionCount" > 0);
ALTER TABLE "DiscoveryState" ADD CONSTRAINT "discovery_offset_nonnegative" CHECK ("offset" >= 0);
CREATE UNIQUE INDEX "one_active_problem_per_user" ON "Recommendation" ("userId", "problemId") WHERE status = 'ACTIVE';

INSERT INTO "ApplicationState" (id, "activeConfig") VALUES (1, 'retain-v1');
