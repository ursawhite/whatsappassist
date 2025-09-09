# Media Caching System

This document explains the media caching system implemented to prevent re-parsing the same media files multiple times.

## Overview

The caching system consists of three main components:

1. **Media Cache** - Stores raw media data (images, videos, PDFs)
2. **Media Metadata** - Stores metadata about media files
3. **Parsed Results Cache** - Stores the final parsed content and analysis results

## Database Tables

### MediaCache
- Stores base64-encoded media data
- Expires after 24 hours
- Indexed by timestamp for efficient cleanup

### MediaMetadata
- Stores metadata like mimetype, filename, timestamp
- Additional metadata fields stored as JSON
- Expires after 24 hours

### MediaParsedResults
- Stores the final parsed content (summary, frame analysis, OCR text)
- Expires after 7 days (longer retention for parsed results)
- Includes frame files paths for videos

## How It Works

### 1. Media Processing Flow

```
Message with Media → Check Parsed Results Cache → ✅ If found: Return cached result (INSTANT)
                                      ↓
                              If not found: Check Media Cache
                                      ↓
                              If found: Use cached media
                                      ↓
                              If not found: Download media
                                      ↓
                              Cache media data and metadata
                                      ↓
                              Process media (OCR, AI analysis, etc.)
                                      ↓
                              Cache parsed results
                                      ↓
                              Return results
```

**Key Optimization:** Parsed results are checked **FIRST** before any media processing, providing instant responses for previously analyzed content.

### 2. Complete Caching Strategy

The system implements a three-tier caching approach:

1. **Parsed Results Cache** (7 days) - Stores final analysis results
2. **Media Cache** (24 hours) - Stores raw media data
3. **Media Metadata** (24 hours) - Stores media information

**Cache Operations:**
- **Media Download**: Automatically caches media data and metadata
- **Direct Media**: Caches provided media objects
- **Cached Media**: Ensures database persistence
- **Video Processing**: Caches frames and OCR results
- **Final Results**: Caches complete parsed content

### 3. Cache Benefits

- **Performance**: Avoids re-downloading and re-processing the same media
- **Cost Savings**: Reduces API calls to OpenAI for transcription and analysis
- **Speed**: **Instant response** for previously processed media (no processing time)
- **Reliability**: Reduces dependency on external services
- **Efficiency**: Skips all media processing when cached results exist

### 4. Cache Expiration

- **Media Cache**: 24 hours (raw data expires quickly)
- **Parsed Results**: 7 days (analysis results kept longer)
- Automatic cleanup of expired entries

## Complete Implementation

### Cache Operations in Parser

The parser now automatically handles all three cache types:

```typescript
// 1. Check parsed results first (fastest response)
const cachedParsedResult = await dbParsedResults.get(mediaKey);
if (cachedParsedResult) {
  return cachedParsedResult; // Instant response
}

// 2. Check media cache
const cachedMedia = await dbMediaCache.get(mediaKey);
if (cachedMedia) {
  media = cachedMedia; // Use cached media
}

// 3. Download and cache if needed
if (!media) {
  media = await message.downloadMedia();
  // Automatically cache media data and metadata
  await dbMediaCache.set(mediaKey, media);
  await dbMediaCache.setMetadata({
    mediaKey: mediaKey,
    mimetype: media.mimetype,
    filename: media.filename,
    timestamp: new Date()
  });
}

// 4. Process and cache results
const result = await processMedia(media);
await dbParsedResults.set(mediaKey, {
  summary: result.summary,
  frameFiles: result.frameFiles,
  frameTexts: result.frameTexts,
  mediaKey: mediaKey,
  mimetype: media.mimetype
});
```

### Cache Coverage

✅ **All Media Sources Cached:**
- Downloaded media (automatic)
- Direct media objects (automatic)
- Cached media objects (persisted to DB)
- Video frames and OCR results (performance optimization)

✅ **All Cache Types Used:**
- Media data cache
- Media metadata cache
- Parsed results cache

### Cache Management

```bash
# Show cache statistics
npm run cache stats

# Clear specific cache
npm run cache clear media
npm run cache clear parsed
npm run cache clear all

# Clean up expired entries
npm run cache cleanup

# Test cache functionality
npm run test-cache
```

## Configuration

### Cache Expiration Times

Edit the cache classes to modify expiration times:

- `src/utils/db_media_cache.ts`: `CACHE_EXPIRY_MS = 24 * 60 * 60 * 1000` (24 hours)
- `src/utils/db_parsed_results.ts`: `CACHE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000` (7 days)

### Database Schema

The schema is defined in `prisma/schema.prisma` and includes:

- Proper indexing for efficient queries
- JSON fields for flexible metadata storage
- Timestamp fields for expiration tracking

## Monitoring

### Cache Statistics

The system provides detailed statistics:

- Total entries in each cache
- Expired entries count
- Estimated cache size
- Cache hit/miss ratios

### Health Checks

Regular cleanup of expired entries prevents database bloat:

```typescript
// Automatic cleanup
await dbMediaCache.clearExpired();
await dbParsedResults.clearExpired();
```

## Best Practices

1. **Always check cache first** before processing media
2. **Cache parsed results** after successful processing
3. **Handle cache failures gracefully** - continue processing even if caching fails
4. **Monitor cache size** and adjust expiration times as needed
5. **Regular cleanup** of expired entries

## Troubleshooting

### Common Issues

1. **Cache not working**: Check database connection and table existence
2. **High memory usage**: Reduce cache expiration times or implement size limits
3. **Stale data**: Clear cache or reduce expiration times
4. **Database errors**: Check Prisma schema and run migrations

### Debug Commands

```bash
# Check database connection
npm run test-cache

# View cache statistics
npm run cache stats

# Clear all caches
npm run cache clear all
```

## Migration

To add the caching system to an existing database:

```bash
# Run Prisma migration
npx prisma migrate dev --name add_media_parsed_results

# Generate Prisma client
npx prisma generate
```

The migration will create the necessary tables and indexes for the caching system.
