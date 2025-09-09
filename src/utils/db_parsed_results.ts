import { db } from '../services/database';

interface ParsedResult {
  summary: string;
  frameFiles: string[];
  frameTexts: string;
  mediaKey: string;
  mimetype: string;
}

export class DatabaseParsedResults {
  private readonly CACHE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days for parsed results
  private static instance: DatabaseParsedResults;

  private constructor() {}

  public static getInstance(): DatabaseParsedResults {
    if (!DatabaseParsedResults.instance) {
      DatabaseParsedResults.instance = new DatabaseParsedResults();
    }
    return DatabaseParsedResults.instance;
  }

  public async set(mediaKey: string, result: ParsedResult): Promise<void> {
    try {
      await db.mediaParsedResults.upsert({
        where: { id: mediaKey },
        update: {
          summary: result.summary,
          frameFiles: result.frameFiles,
          frameTexts: result.frameTexts,
          mediaKey: result.mediaKey,
          mimetype: result.mimetype,
          timestamp: new Date(),
        },
        create: {
          id: mediaKey,
          summary: result.summary,
          frameFiles: result.frameFiles,
          frameTexts: result.frameTexts,
          mediaKey: result.mediaKey,
          mimetype: result.mimetype,
          timestamp: new Date(),
        },
      });
    } catch (error) {
      console.error('Error setting parsed results:', error);
      throw error;
    }
  }

  public async get(mediaKey: string): Promise<ParsedResult | undefined> {
    try {
      const cached = await db.mediaParsedResults.findUnique({
        where: { id: mediaKey },
      });

      if (!cached) return undefined;

      // Check if cache has expired
      const now = new Date();
      const expiryTime = new Date(cached.timestamp.getTime() + this.CACHE_EXPIRY_MS);
      
      if (now > expiryTime) {
        // Delete expired cache entry
        await db.mediaParsedResults.delete({
          where: { id: mediaKey },
        });
        return undefined;
      }

      return {
        summary: cached.summary,
        frameFiles: cached.frameFiles,
        frameTexts: cached.frameTexts,
        mediaKey: cached.mediaKey,
        mimetype: cached.mimetype,
      };
    } catch (error) {
      console.error('Error getting parsed results:', error);
      return undefined;
    }
  }

  public async clear(): Promise<void> {
    try {
      await db.mediaParsedResults.deleteMany({});
    } catch (error) {
      console.error('Error clearing parsed results:', error);
      throw error;
    }
  }

  public async clearExpired(): Promise<void> {
    try {
      const expiryDate = new Date(Date.now() - this.CACHE_EXPIRY_MS);
      
      await db.mediaParsedResults.deleteMany({
        where: {
          timestamp: {
            lt: expiryDate,
          },
        },
      });
    } catch (error) {
      console.error('Error clearing expired parsed results:', error);
      throw error;
    }
  }

  public async getStats(): Promise<{
    totalEntries: number;
    expiredEntries: number;
    totalSize: string;
  }> {
    try {
      const expiryDate = new Date(Date.now() - this.CACHE_EXPIRY_MS);
      
      const [totalEntries, expiredEntries] = await Promise.all([
        db.mediaParsedResults.count(),
        db.mediaParsedResults.count({
          where: {
            timestamp: {
              lt: expiryDate,
            },
          },
        }),
      ]);

      // Estimate total size by sampling
      const sample = await db.mediaParsedResults.findMany({
        select: { summary: true, frameTexts: true },
        take: 50,
      });
      const avgSize = sample.length > 0
        ? sample.reduce((sum, row) => sum + (row.summary?.length || 0) + (row.frameTexts?.length || 0), 0) / sample.length
        : 0;
      const estimatedSize = totalEntries * avgSize;
      const totalSize = `${(estimatedSize / 1024 / 1024).toFixed(2)} MB`;

      return {
        totalEntries,
        expiredEntries,
        totalSize,
      };
    } catch (error) {
      console.error('Error getting parsed results stats:', error);
      return {
        totalEntries: 0,
        expiredEntries: 0,
        totalSize: '0 MB',
      };
    }
  }
}

export const dbParsedResults = DatabaseParsedResults.getInstance();
