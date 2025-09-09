import { Client } from 'minio';
import { MINIO_CONFIG } from '../utils/env';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class MinIOService {
  private static instance: MinIOService;
  private client: Client;
  private bucketName: string;
  private isInitialized: boolean = false;

  private constructor() {
    this.client = new Client({
      endPoint: MINIO_CONFIG.endpoint,
      port: MINIO_CONFIG.port,
      useSSL: MINIO_CONFIG.useSSL,
      accessKey: MINIO_CONFIG.accessKey,
      secretKey: MINIO_CONFIG.secretKey,
    });
    this.bucketName = MINIO_CONFIG.bucketName;
  }

  public static getInstance(): MinIOService {
    if (!MinIOService.instance) {
      MinIOService.instance = new MinIOService();
    }
    return MinIOService.instance;
  }

  /**
   * Initialize MinIO service and ensure bucket exists
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Check if bucket exists, create if not
      const bucketExists = await this.client.bucketExists(this.bucketName);
      if (!bucketExists) {
        await this.client.makeBucket(this.bucketName, 'us-east-1');
        console.log(`✅ Created MinIO bucket: ${this.bucketName}`);
      } else {
        console.log(`✅ MinIO bucket exists: ${this.bucketName}`);
      }

      this.isInitialized = true;
      console.log('✅ MinIO service initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize MinIO service:', error);
      throw error;
    }
  }

  /**
   * Upload file to MinIO
   */
  public async uploadFile(
    objectName: string,
    filePath: string,
    contentType?: string
  ): Promise<string> {
    await this.initialize();

    try {
      const fileStream = fs.createReadStream(filePath);
      const stats = fs.statSync(filePath);
      
      await this.client.putObject(
        this.bucketName,
        objectName,
        fileStream,
        stats.size,
        { 'Content-Type': contentType || 'application/octet-stream' }
      );

      const url = await this.getFileUrl(objectName);
      console.log(`✅ Uploaded to MinIO: ${objectName} (${Math.round(stats.size / 1024 / 1024 * 100) / 100}MB)`);
      return url;
    } catch (error) {
      console.error(`❌ Failed to upload ${objectName} to MinIO:`, error);
      throw error;
    }
  }

  /**
   * Upload buffer to MinIO
   */
  public async uploadBuffer(
    objectName: string,
    buffer: Buffer,
    contentType?: string
  ): Promise<string> {
    await this.initialize();

    try {
      await this.client.putObject(
        this.bucketName,
        objectName,
        buffer,
        buffer.length,
        { 'Content-Type': contentType || 'application/octet-stream' }
      );

      const url = await this.getFileUrl(objectName);
      console.log(`✅ Uploaded buffer to MinIO: ${objectName} (${Math.round(buffer.length / 1024 / 1024 * 100) / 100}MB)`);
      return url;
    } catch (error) {
      console.error(`❌ Failed to upload buffer ${objectName} to MinIO:`, error);
      throw error;
    }
  }

  /**
   * Download file from MinIO to local path
   */
  public async downloadFile(objectName: string, localPath: string): Promise<void> {
    await this.initialize();

    try {
      // Ensure directory exists
      const dir = path.dirname(localPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const fileStream = fs.createWriteStream(localPath);
      await this.client.getObject(this.bucketName, objectName).then((stream) => {
        return new Promise<void>((resolve, reject) => {
          stream.pipe(fileStream);
          fileStream.on('finish', () => resolve());
          fileStream.on('error', reject);
        });
      });

      console.log(`✅ Downloaded from MinIO: ${objectName} -> ${localPath}`);
    } catch (error) {
      console.error(`❌ Failed to download ${objectName} from MinIO:`, error);
      throw error;
    }
  }

  /**
   * Get file as buffer from MinIO
   */
  public async getFileBuffer(objectName: string): Promise<Buffer> {
    await this.initialize();

    try {
      const stream = await this.client.getObject(this.bucketName, objectName);
      const chunks: Buffer[] = [];
      
      return new Promise<Buffer>((resolve, reject) => {
        stream.on('data', (chunk) => chunks.push(chunk));
        stream.on('end', () => resolve(Buffer.concat(chunks)));
        stream.on('error', reject);
      });
    } catch (error) {
      console.error(`❌ Failed to get buffer for ${objectName} from MinIO:`, error);
      throw error;
    }
  }

  /**
   * Get presigned URL for file access
   */
  public async getFileUrl(objectName: string, expiryHours: number = 24): Promise<string> {
    await this.initialize();

    try {
      const url = await this.client.presignedGetObject(
        this.bucketName,
        objectName,
        expiryHours * 60 * 60 // Convert hours to seconds
      );
      return url;
    } catch (error) {
      console.error(`❌ Failed to get URL for ${objectName}:`, error);
      throw error;
    }
  }

  /**
   * Check if file exists in MinIO
   */
  public async fileExists(objectName: string): Promise<boolean> {
    await this.initialize();

    try {
      await this.client.statObject(this.bucketName, objectName);
      return true;
    } catch (error: any) {
      if (error.code === 'NotFound') {
        return false;
      }
      throw error;
    }
  }

  /**
   * Delete file from MinIO
   */
  public async deleteFile(objectName: string): Promise<void> {
    await this.initialize();

    try {
      await this.client.removeObject(this.bucketName, objectName);
      console.log(`✅ Deleted from MinIO: ${objectName}`);
    } catch (error) {
      console.error(`❌ Failed to delete ${objectName} from MinIO:`, error);
      throw error;
    }
  }

  /**
   * List files in MinIO bucket with prefix
   */
  public async listFiles(prefix?: string): Promise<string[]> {
    await this.initialize();

    try {
      const files: string[] = [];
      const stream = this.client.listObjects(this.bucketName, prefix, true);
      
      return new Promise<string[]>((resolve, reject) => {
        stream.on('data', (obj) => {
          if (obj.name) files.push(obj.name);
        });
        stream.on('end', () => resolve(files));
        stream.on('error', reject);
      });
    } catch (error) {
      console.error('❌ Failed to list files from MinIO:', error);
      throw error;
    }
  }

  /**
   * Get file metadata from MinIO
   */
  public async getFileMetadata(objectName: string): Promise<any> {
    await this.initialize();

    try {
      const stat = await this.client.statObject(this.bucketName, objectName);
      return {
        size: stat.size,
        lastModified: stat.lastModified,
        etag: stat.etag,
        contentType: stat.metaData?.['content-type'],
        ...stat.metaData
      };
    } catch (error) {
      console.error(`❌ Failed to get metadata for ${objectName}:`, error);
      throw error;
    }
  }

  /**
   * Generate object name for media files
   */
  public generateObjectName(mediaKey: string, fileType: string, extension: string): string {
    const timestamp = Date.now();
    const sanitizedKey = mediaKey.replace(/[^a-zA-Z0-9]/g, '_');
    return `${fileType}/${sanitizedKey}_${timestamp}.${extension}`;
  }

  /**
   * Generate object name for video segments
   */
  public generateSegmentObjectName(mediaKey: string, segmentIndex: number): string {
    const timestamp = Date.now();
    const sanitizedKey = mediaKey.replace(/[^a-zA-Z0-9]/g, '_');
    return `video/segments/${sanitizedKey}_${timestamp}_segment_${segmentIndex.toString().padStart(3, '0')}.mp3`;
  }

  /**
   * Generate object name for video frames
   */
  public generateFrameObjectName(mediaKey: string, frameIndex: number): string {
    const timestamp = Date.now();
    const sanitizedKey = mediaKey.replace(/[^a-zA-Z0-9]/g, '_');
    return `video/frames/${sanitizedKey}_${timestamp}_frame_${frameIndex.toString().padStart(3, '0')}.jpg`;
  }
}

// Export singleton instance
export const minioService = MinIOService.getInstance();
