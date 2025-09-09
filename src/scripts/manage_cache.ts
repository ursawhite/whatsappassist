import { dbParsedResults } from '../utils/db_parsed_results';
import { dbMediaCache } from '../utils/db_media_cache';
import { DatabaseService } from '../services/database';

async function manageCache() {
  try {
    // Connect to database
    await DatabaseService.getInstance().connect();
    
    const command = process.argv[2];
    const target = process.argv[3];

    console.log('🗄️  Cache Management Utility\n');

    switch (command) {
      case 'stats':
        await showStats();
        break;
      case 'clear':
        await clearCache(target);
        break;
      case 'cleanup':
        await cleanupExpired();
        break;
      default:
        console.log('Usage: npm run cache <command> [target]');
        console.log('');
        console.log('Commands:');
        console.log('  stats                    - Show cache statistics');
        console.log('  clear [media|parsed|all] - Clear cache (default: all)');
        console.log('  cleanup                  - Remove expired entries');
        console.log('');
        console.log('Examples:');
        console.log('  npm run cache stats');
        console.log('  npm run cache clear media');
        console.log('  npm run cache clear parsed');
        console.log('  npm run cache clear all');
        console.log('  npm run cache cleanup');
    }

  } catch (error) {
    console.error('❌ Cache management failed:', error);
  } finally {
    await DatabaseService.getInstance().disconnect();
  }
}

async function showStats() {
  console.log('📊 Cache Statistics\n');

  const [mediaStats, parsedStats] = await Promise.all([
    dbMediaCache.getCacheStats(),
    dbParsedResults.getStats()
  ]);

  console.log('Media Cache:');
  console.log(`  Total entries: ${mediaStats.totalEntries}`);
  console.log(`  Total metadata: ${mediaStats.totalMetadata}`);
  console.log(`  Expired entries: ${mediaStats.expiredEntries}`);
  console.log(`  Cache size: ${mediaStats.cacheSize}`);
  console.log('');

  console.log('Parsed Results Cache:');
  console.log(`  Total entries: ${parsedStats.totalEntries}`);
  console.log(`  Expired entries: ${parsedStats.expiredEntries}`);
  console.log(`  Total size: ${parsedStats.totalSize}`);
  console.log('');
}

async function clearCache(target: string = 'all') {
  console.log(`🧹 Clearing cache: ${target}\n`);

  switch (target.toLowerCase()) {
    case 'media':
      await dbMediaCache.clear();
      console.log('✅ Media cache cleared');
      break;
    case 'parsed':
      await dbParsedResults.clear();
      console.log('✅ Parsed results cache cleared');
      break;
    case 'all':
    default:
      await Promise.all([
        dbMediaCache.clear(),
        dbParsedResults.clear()
      ]);
      console.log('✅ All caches cleared');
      break;
  }
  console.log('');
}

async function cleanupExpired() {
  console.log('🧹 Cleaning up expired entries...\n');

  await Promise.all([
    dbMediaCache.clearExpired(),
    dbParsedResults.clearExpired()
  ]);

  console.log('✅ Expired entries cleaned up');
  console.log('');

  // Show updated stats
  await showStats();
}

// Run the cache management
manageCache();
