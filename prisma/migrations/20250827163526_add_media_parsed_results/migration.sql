-- CreateTable
CREATE TABLE "media_cache" (
    "id" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "mimetype" TEXT NOT NULL,
    "filename" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "media_cache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_metadata" (
    "id" TEXT NOT NULL,
    "mimetype" TEXT,
    "filename" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "media_metadata_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_parsed_results" (
    "id" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "frameFiles" TEXT[],
    "frameTexts" TEXT NOT NULL,
    "mediaKey" TEXT NOT NULL,
    "mimetype" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "media_parsed_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "known_groups" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "known_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wa_session" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "creds" JSONB NOT NULL,
    "keys" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wa_session_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "media_cache_timestamp_idx" ON "media_cache"("timestamp");

-- CreateIndex
CREATE INDEX "media_metadata_timestamp_idx" ON "media_metadata"("timestamp");

-- CreateIndex
CREATE INDEX "media_parsed_results_timestamp_idx" ON "media_parsed_results"("timestamp");
