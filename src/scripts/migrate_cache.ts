#!/usr/bin/env tsx

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { db } from '../services/database';
import { DatabaseService } from '../services/database';

interface LegacyCacheData {
  data: any;
  timestamp: number;
}

interface LegacyMetadataData {
  mediaKey: string;
  mimetype?: string;
  filename?: string;
  timestamp: number;
  [key: string]: any;
}

async function migrateCacheToDatabase() {
  console.log('🚀 Starting cache migration to database...');

  try {
    // File paths
    const cacheDir = join(process.cwd(), 'cache');
    const dataDir = join(process.cwd(), 'data');
    const mediaCacheFile = join(cacheDir, 'media_cache.json');
    const mediaMetadataFile = join(cacheDir, 'media_metadata.json');
    const knownGroupsFile = join(dataDir, 'known_groups.json');

    let migratedCount = 0;

    // Migrate media cache
    if (existsSync(mediaCacheFile)) {
      console.log('📁 Found media cache file, migrating...');
      const cacheData = JSON.parse(readFileSync(mediaCacheFile, 'utf8'));
      
      for (const [mediaKey, cacheEntry] of Object.entries(cacheData)) {
        const entry = cacheEntry as LegacyCacheData;
        
        try {
          await db.mediaCache.upsert({
            where: { id: mediaKey },
            update: {
              data: JSON.stringify(entry.data),
              timestamp: new Date(entry.timestamp),
              mimetype: entry.data?.mimetype || '',
              filename: entry.data?.filename || null,
            },
            create: {
              id: mediaKey,
              data: JSON.stringify(entry.data),
              mimetype: entry.data?.mimetype || '',
              filename: entry.data?.filename || null,
              timestamp: new Date(entry.timestamp),
            },
          });
          migratedCount++;
        } catch (error) {
          console.error(`❌ Failed to migrate media cache entry ${mediaKey}:`, error);
        }
      }
      console.log(`✅ Migrated ${migratedCount} media cache entries`);
    }

    // Migrate media metadata
    migratedCount = 0;
    if (existsSync(mediaMetadataFile)) {
      console.log('📁 Found media metadata file, migrating...');
      const metadataData = JSON.parse(readFileSync(mediaMetadataFile, 'utf8'));
      
      for (const [mediaKey, metadata] of Object.entries(metadataData)) {
        const metadataEntry = metadata as LegacyMetadataData;
        
        try {
          const { mediaKey: key, mimetype, filename, timestamp, ...additionalMetadata } = metadataEntry;
          
          await db.mediaMetadata.upsert({
            where: { id: mediaKey },
            update: {
              mimetype: mimetype || null,
              filename: filename || null,
              timestamp: new Date(timestamp),
              metadata: Object.keys(additionalMetadata).length > 0 ? additionalMetadata : undefined,
            },
            create: {
              id: mediaKey,
              mimetype: mimetype || null,
              filename: filename || null,
              timestamp: new Date(timestamp),
              metadata: Object.keys(additionalMetadata).length > 0 ? additionalMetadata : undefined,
            },
          });
          migratedCount++;
        } catch (error) {
          console.error(`❌ Failed to migrate metadata entry ${mediaKey}:`, error);
        }
      }
      console.log(`✅ Migrated ${migratedCount} media metadata entries`);
    }

    // Migrate known groups
    migratedCount = 0;
    if (existsSync(knownGroupsFile)) {
      console.log('📁 Found known groups file, migrating...');
      const groupsData = JSON.parse(readFileSync(knownGroupsFile, 'utf8'));
      
      for (const groupId of groupsData) {
        try {
          await db.knownGroup.upsert({
            where: { id: groupId },
            update: {}, // No updates needed
            create: {
              id: groupId,
            },
          });
          migratedCount++;
        } catch (error) {
          console.error(`❌ Failed to migrate group ${groupId}:`, error);
        }
      }
      console.log(`✅ Migrated ${migratedCount} known groups`);
    }

    // Show final statistics
    const stats = await Promise.all([
      db.mediaCache.count(),
      db.mediaMetadata.count(),
      db.knownGroup.count(),
    ]);

    console.log('\n📊 Migration Complete! Database Statistics:');
    console.log(`   Media Cache Entries: ${stats[0]}`);
    console.log(`   Media Metadata Entries: ${stats[1]}`);
    console.log(`   Known Groups: ${stats[2]}`);

    console.log('\n🎉 Cache migration completed successfully!');
    console.log('\n📝 Next steps:');
    console.log('   1. Update your code to use the new database cache classes');
    console.log('   2. Test the application thoroughly');
    console.log('   3. Remove old cache files when confident');
    
  } catch (error) {
    console.error('💥 Migration failed:', error);
    process.exit(1);
  } finally {
    await DatabaseService.getInstance().disconnect();
  }
}

// Run migration if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  migrateCacheToDatabase();
}
