import { minioService } from '../services/minio_service';
import { dbMediaCache } from './db_media_cache';

export class MinIOCache {
  private static instance: MinIOCache;

  private constructor() {}

  public static getInstance(): MinIOCache {
    if (!MinIOCache.instance) {
      MinIOCache.instance = new MinIOCache();
    }
    return MinIOCache.instance;
  }

  /**
   * Get file from MinIO with caching
   */
  public async getFile(mediaKey: string, objectName: string): Promise<Buffer | null> {
    try {
      // Check if file exists in MinIO
      const exists = await minioService.fileExists(objectName);
      if (!exists) {
        console.log(`File not found in MinIO: ${objectName}`);
        return null;
      }

      // Get file buffer from MinIO
      const buffer = await minioService.getFileBuffer(objectName);
      console.log(`✅ Retrieved from MinIO: ${objectName} (${Math.round(buffer.length / 1024 / 1024 * 100) / 100}MB)`);
      
      return buffer;
    } catch (error) {
      console.error(`Error getting file from MinIO: ${objectName}`, error);
      return null;
    }
  }

  /**
   * Upload file to MinIO and cache metadata
   */
  public async uploadFile(
    mediaKey: string,
    objectName: string,
    buffer: Buffer,
    contentType: string
  ): Promise<string> {
    try {
      // Upload to MinIO
      const url = await minioService.uploadBuffer(objectName, buffer, contentType);
      
      // Cache metadata
      await dbMediaCache.setMetadata({
        mediaKey: `${mediaKey}_minio`,
        mimetype: contentType,
        filename: objectName,
        timestamp: new Date(),
        minioUrl: url,
        objectName: objectName
      });

      console.log(`✅ File uploaded and cached: ${objectName}`);
      return url;
    } catch (error) {
      console.error(`Error uploading file to MinIO: ${objectName}`, error);
      throw error;
    }
  }

  /**
   * Get MinIO URL for file
   */
  public async getFileUrl(mediaKey: string, objectName: string): Promise<string | null> {
    try {
      // Check if we have cached URL
      const metadata = await dbMediaCache.getMetadata(`${mediaKey}_minio`);
      if (metadata?.minioUrl) {
        return metadata.minioUrl;
      }

      // Generate new URL
      const url = await minioService.getFileUrl(objectName);
      
      // Cache the URL
      if (metadata) {
        metadata.minioUrl = url;
        await dbMediaCache.setMetadata({
          mediaKey: `${mediaKey}_minio`,
          mimetype: metadata.mimetype,
          filename: metadata.filename,
          timestamp: metadata.timestamp,
          minioUrl: url,
          objectName: metadata.objectName
        });
      }

      return url;
    } catch (error) {
      console.error(`Error getting MinIO URL: ${objectName}`, error);
      return null;
    }
  }

  /**
   * Check if file exists in MinIO
   */
  public async fileExists(mediaKey: string, objectName: string): Promise<boolean> {
    try {
      return await minioService.fileExists(objectName);
    } catch (error) {
      console.error(`Error checking file existence: ${objectName}`, error);
      return false;
    }
  }

  /**
   * Delete file from MinIO and clear cache
   */
  public async deleteFile(mediaKey: string, objectName: string): Promise<void> {
    try {
      await minioService.deleteFile(objectName);
      await dbMediaCache.deleteMetadata(`${mediaKey}_minio`);
      console.log(`✅ File deleted from MinIO: ${objectName}`);
    } catch (error) {
      console.error(`Error deleting file from MinIO: ${objectName}`, error);
      throw error;
    }
  }

  /**
   * List files in MinIO with prefix
   */
  public async listFiles(prefix?: string): Promise<string[]> {
    try {
      return await minioService.listFiles(prefix);
    } catch (error) {
      console.error('Error listing files from MinIO:', error);
      return [];
    }
  }

  /**
   * Get file metadata from MinIO
   */
  public async getFileMetadata(mediaKey: string, objectName: string): Promise<any> {
    try {
      const metadata = await minioService.getFileMetadata(objectName);
      
      // Cache metadata
      await dbMediaCache.setMetadata({
        mediaKey: `${mediaKey}_minio`,
        mimetype: metadata.contentType,
        filename: objectName,
        timestamp: new Date(metadata.lastModified),
        minioUrl: await minioService.getFileUrl(objectName),
        objectName: objectName,
        size: metadata.size,
        etag: metadata.etag
      });

      return metadata;
    } catch (error) {
      console.error(`Error getting file metadata: ${objectName}`, error);
      return null;
    }
  }
}

// Export singleton instance
export const minioCache = MinIOCache.getInstance();
