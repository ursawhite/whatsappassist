#!/usr/bin/env tsx

import { minioService } from '../services/minio_service';
import { minioCache } from '../utils/minio_cache';
import { dbMediaCache } from '../utils/db_media_cache';
import { DatabaseService } from '../services/database';

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  try {
    // Initialize database
    const dbService = DatabaseService.getInstance();
    await dbService.connect();
    console.log('✅ Database connected');

    // Initialize MinIO
    await minioService.initialize();
    console.log('✅ MinIO initialized');

    switch (command) {
      case 'list':
        await listFiles(args[1]); // prefix
        break;
      case 'info':
        await getFileInfo(args[1]); // objectName
        break;
      case 'delete':
        await deleteFile(args[1]); // objectName
        break;
      case 'cleanup':
        await cleanupOldFiles(parseInt(args[1]) || 7); // days
        break;
      case 'stats':
        await getStats();
        break;
      case 'sync':
        await syncCache();
        break;
      default:
        printUsage();
    }
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await dbService.disconnect();
    process.exit(0);
  }
}

async function listFiles(prefix?: string) {
  console.log(`📁 Listing files${prefix ? ` with prefix: ${prefix}` : ''}`);
  const files = await minioService.listFiles(prefix);
  
  if (files.length === 0) {
    console.log('No files found');
    return;
  }

  console.log(`Found ${files.length} files:`);
  for (const file of files) {
    try {
      const metadata = await minioService.getFileMetadata(file);
      const sizeMB = Math.round(metadata.size / 1024 / 1024 * 100) / 100;
      console.log(`  📄 ${file} (${sizeMB}MB) - ${metadata.lastModified}`);
    } catch (error) {
      console.log(`  📄 ${file} (error getting metadata)`);
    }
  }
}

async function getFileInfo(objectName: string) {
  if (!objectName) {
    console.error('❌ Object name is required');
    return;
  }

  console.log(`ℹ️  Getting info for: ${objectName}`);
  
  try {
    const exists = await minioService.fileExists(objectName);
    if (!exists) {
      console.log('❌ File not found in MinIO');
      return;
    }

    const metadata = await minioService.getFileMetadata(objectName);
    const url = await minioService.getFileUrl(objectName);
    
    console.log('📋 File Information:');
    console.log(`  Name: ${objectName}`);
    console.log(`  Size: ${Math.round(metadata.size / 1024 / 1024 * 100) / 100}MB`);
    console.log(`  Type: ${metadata.contentType}`);
    console.log(`  Modified: ${metadata.lastModified}`);
    console.log(`  ETag: ${metadata.etag}`);
    console.log(`  URL: ${url}`);
  } catch (error) {
    console.error('❌ Error getting file info:', error);
  }
}

async function deleteFile(objectName: string) {
  if (!objectName) {
    console.error('❌ Object name is required');
    return;
  }

  console.log(`🗑️  Deleting file: ${objectName}`);
  
  try {
    await minioService.deleteFile(objectName);
    console.log('✅ File deleted successfully');
  } catch (error) {
    console.error('❌ Error deleting file:', error);
  }
}

async function cleanupOldFiles(days: number) {
  console.log(`🧹 Cleaning up files older than ${days} days`);
  
  try {
    const files = await minioService.listFiles();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    let deletedCount = 0;
    
    for (const file of files) {
      try {
        const metadata = await minioService.getFileMetadata(file);
        const fileDate = new Date(metadata.lastModified);
        
        if (fileDate < cutoffDate) {
          await minioService.deleteFile(file);
          console.log(`🗑️  Deleted old file: ${file}`);
          deletedCount++;
        }
      } catch (error) {
        console.error(`❌ Error processing file ${file}:`, error);
      }
    }
    
    console.log(`✅ Cleanup completed. Deleted ${deletedCount} files`);
  } catch (error) {
    console.error('❌ Error during cleanup:', error);
  }
}

async function getStats() {
  console.log('📊 Getting MinIO statistics');
  
  try {
    const files = await minioService.listFiles();
    let totalSize = 0;
    const typeStats: { [key: string]: { count: number; size: number } } = {};
    
    for (const file of files) {
      try {
        const metadata = await minioService.getFileMetadata(file);
        totalSize += metadata.size;
        
        const contentType = metadata.contentType || 'unknown';
        if (!typeStats[contentType]) {
          typeStats[contentType] = { count: 0, size: 0 };
        }
        typeStats[contentType].count++;
        typeStats[contentType].size += metadata.size;
      } catch (error) {
        console.error(`❌ Error getting metadata for ${file}:`, error);
      }
    }
    
    console.log('📈 MinIO Statistics:');
    console.log(`  Total files: ${files.length}`);
    console.log(`  Total size: ${Math.round(totalSize / 1024 / 1024 * 100) / 100}MB`);
    console.log('\n  By type:');
    
    for (const [type, stats] of Object.entries(typeStats)) {
      const sizeMB = Math.round(stats.size / 1024 / 1024 * 100) / 100;
      console.log(`    ${type}: ${stats.count} files (${sizeMB}MB)`);
    }
  } catch (error) {
    console.error('❌ Error getting statistics:', error);
  }
}

async function syncCache() {
  console.log('🔄 Syncing MinIO cache with database');
  
  try {
    // Get all MinIO files
    const minioFiles = await minioService.listFiles();
    console.log(`Found ${minioFiles.length} files in MinIO`);
    
    // Get all cached metadata
    const cachedMetadata = await dbMediaCache.getAllMetadata();
    console.log(`Found ${cachedMetadata.length} cached metadata entries`);
    
    // Check for orphaned cache entries
    let orphanedCount = 0;
    for (const metadata of cachedMetadata) {
      if (metadata.objectName && !minioFiles.includes(metadata.objectName)) {
        console.log(`🗑️  Removing orphaned cache entry: ${metadata.objectName}`);
        await dbMediaCache.deleteMetadata(metadata.mediaKey);
        orphanedCount++;
      }
    }
    
    console.log(`✅ Sync completed. Removed ${orphanedCount} orphaned cache entries`);
  } catch (error) {
    console.error('❌ Error during sync:', error);
  }
}

function printUsage() {
  console.log(`
🔧 MinIO Cache Management Tool

Usage: npm run minio <command> [options]

Commands:
  list [prefix]           List all files in MinIO (optionally with prefix)
  info <objectName>       Get detailed information about a file
  delete <objectName>     Delete a file from MinIO
  cleanup [days]          Delete files older than specified days (default: 7)
  stats                   Show MinIO statistics
  sync                    Sync MinIO cache with database

Examples:
  npm run minio list
  npm run minio list video/
  npm run minio info video/abc123.mp4
  npm run minio delete video/abc123.mp4
  npm run minio cleanup 30
  npm run minio stats
  npm run minio sync
`);
}

if (require.main === module) {
  main();
}
