#!/usr/bin/env tsx

import fs from 'fs';
import path from 'path';

const TEMP_DIR = path.join(process.cwd(), 'temp');
const MAX_AGE_HOURS = 24; // Cleanup files older than 24 hours

async function cleanupTempDirectories() {
  console.log('🧹 Starting temp directory cleanup...');
  
  if (!fs.existsSync(TEMP_DIR)) {
    console.log('✅ Temp directory does not exist, nothing to clean');
    return;
  }

  try {
    const items = fs.readdirSync(TEMP_DIR);
    let cleanedCount = 0;
    let errorCount = 0;
    
    const cutoffTime = Date.now() - (MAX_AGE_HOURS * 60 * 60 * 1000);
    
    for (const item of items) {
      const itemPath = path.join(TEMP_DIR, item);
      const stats = fs.statSync(itemPath);
      
      if (stats.isDirectory() && stats.mtime.getTime() < cutoffTime) {
        try {
          fs.rmSync(itemPath, { recursive: true, force: true });
          console.log(`🗑️  Cleaned up old temp directory: ${item}`);
          cleanedCount++;
        } catch (error) {
          console.error(`❌ Error cleaning up ${item}:`, error);
          errorCount++;
        }
      }
    }
    
    console.log(`✅ Cleanup completed:`);
    console.log(`   - Cleaned: ${cleanedCount} directories`);
    console.log(`   - Errors: ${errorCount}`);
    console.log(`   - Remaining: ${items.length - cleanedCount} directories`);
    
  } catch (error) {
    console.error('❌ Error during cleanup:', error);
  }
}

// Run cleanup if called directly
if (require.main === module) {
  cleanupTempDirectories().then(() => {
    process.exit(0);
  }).catch((error) => {
    console.error('❌ Cleanup failed:', error);
    process.exit(1);
  });
}

export { cleanupTempDirectories };
