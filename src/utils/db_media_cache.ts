import { db } from '../services/database';

interface CachedMedia {
  data: string;
  mimetype: string;
  timestamp: Date;
  mediaKey: string;
  filename?: string;
}

interface MetadataData {
  mediaKey: string;
  mimetype?: string;
  filename?: string;
  timestamp: Date;
  [key: string]: any;
}

export class DatabaseMediaCache {
  private readonly CACHE_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours
  private static instance: DatabaseMediaCache;

  private constructor() {}

  public static getInstance(): DatabaseMediaCache {
    if (!DatabaseMediaCache.instance) {
      DatabaseMediaCache.instance = new DatabaseMediaCache();
    }
    return DatabaseMediaCache.instance;
  }

  public async set(mediaKey: string, data: any): Promise<void> {
    try {
      await db.mediaCache.upsert({
        where: { id: mediaKey },
        update: {
          data: JSON.stringify(data),
          timestamp: new Date(),
          mimetype: data.mimetype || '',
          filename: data.filename || null,
        },
        create: {
          id: mediaKey,
          data: JSON.stringify(data),
          mimetype: data.mimetype || '',
          filename: data.filename || null,
          timestamp: new Date(),
        },
      });
    } catch (error) {
      console.error('Error setting media cache:', error);
      throw error;
    }
  }

  public async get(mediaKey: string): Promise<any> {
    try {
      const cached = await db.mediaCache.findUnique({
        where: { id: mediaKey },
      });

      if (!cached) return undefined;

      // Check if cache has expired
      const now = new Date();
      const expiryTime = new Date(cached.timestamp.getTime() + this.CACHE_EXPIRY_MS);
      
      if (now > expiryTime) {
        // Delete expired cache entry
        await db.mediaCache.delete({
          where: { id: mediaKey },
        });
        return undefined;
      }

      return JSON.parse(cached.data);
    } catch (error) {
      console.error('Error getting media cache:', error);
      return undefined;
    }
  }

  public async setMetadata(metadata: MetadataData): Promise<void> {
    try {
      const { mediaKey, ...metadataFields } = metadata;
      
      await db.mediaMetadata.upsert({
        where: { id: mediaKey },
        update: {
          mimetype: metadata.mimetype || null,
          filename: metadata.filename || null,
          timestamp: new Date(),
          metadata: Object.keys(metadataFields).length > 0 ? metadataFields : undefined,
        },
        create: {
          id: mediaKey,
          mimetype: metadata.mimetype || null,
          filename: metadata.filename || null,
          timestamp: new Date(),
          metadata: Object.keys(metadataFields).length > 0 ? metadataFields : undefined,
        },
      });
    } catch (error) {
      console.error('Error setting media metadata:', error);
      throw error;
    }
  }

  public async getMetadata(mediaKey: string): Promise<MetadataData | undefined> {
    try {
      const metadata = await db.mediaMetadata.findUnique({
        where: { id: mediaKey },
      });

      if (!metadata) return undefined;

      // Check if cache has expired
      const now = new Date();
      const expiryTime = new Date(metadata.timestamp.getTime() + this.CACHE_EXPIRY_MS);
      
      if (now > expiryTime) {
        // Delete expired metadata entry
        await db.mediaMetadata.delete({
          where: { id: mediaKey },
        });
        return undefined;
      }

      return {
        mediaKey,
        mimetype: metadata.mimetype || undefined,
        filename: metadata.filename || undefined,
        timestamp: metadata.timestamp,
        ...(metadata.metadata as object || {}),
      };
    } catch (error) {
      console.error('Error getting media metadata:', error);
      return undefined;
    }
  }

  public async deleteMetadata(mediaKey: string): Promise<void> {
    try {
      await db.mediaMetadata.delete({
        where: { id: mediaKey },
      });
    } catch (error) {
      console.error('Error deleting media metadata:', error);
      throw error;
    }
  }

  public async clear(): Promise<void> {
    try {
      await db.$transaction([
        db.mediaCache.deleteMany({}),
        db.mediaMetadata.deleteMany({}),
      ]);
    } catch (error) {
      console.error('Error clearing media cache:', error);
      throw error;
    }
  }

  public async clearExpired(): Promise<void> {
    try {
      const expiryDate = new Date(Date.now() - this.CACHE_EXPIRY_MS);
      
      await db.$transaction([
        db.mediaCache.deleteMany({
          where: {
            timestamp: {
              lt: expiryDate,
            },
          },
        }),
        db.mediaMetadata.deleteMany({
          where: {
            timestamp: {
              lt: expiryDate,
            },
          },
        }),
      ]);
    } catch (error) {
      console.error('Error clearing expired cache:', error);
      throw error;
    }
  }

  // Additional database-specific features
  public async getCacheStats(): Promise<{
    totalEntries: number;
    totalMetadata: number;
    expiredEntries: number;
    cacheSize: string;
  }> {
    try {
      const expiryDate = new Date(Date.now() - this.CACHE_EXPIRY_MS);
      
      const [totalEntries, totalMetadata, expiredEntries] = await Promise.all([
        db.mediaCache.count(),
        db.mediaMetadata.count(),
        db.mediaCache.count({
          where: {
            timestamp: {
              lt: expiryDate,
            },
          },
        }),
      ]);

      // Estimate cache size by sampling a few entries (data is string length)
      const sample = await db.mediaCache.findMany({
        select: { data: true },
        take: 50,
      });
      const avgLen = sample.length > 0
        ? sample.reduce((sum, row) => sum + (row.data?.length || 0), 0) / sample.length
        : 0;
      const estimatedSize = totalEntries * avgLen;
      const cacheSize = `${(estimatedSize / 1024 / 1024).toFixed(2)} MB`;

      return {
        totalEntries,
        totalMetadata,
        expiredEntries,
        cacheSize,
      };
    } catch (error) {
      console.error('Error getting cache stats:', error);
      return {
        totalEntries: 0,
        totalMetadata: 0,
        expiredEntries: 0,
        cacheSize: '0 MB',
      };
    }
  }
}

export const dbMediaCache = DatabaseMediaCache.getInstance();
