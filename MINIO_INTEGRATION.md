# MinIO Integration for WhatsApp Media Processing

This document explains the MinIO integration implemented to store and manage media files from WhatsApp messages.

## Overview

The MinIO integration provides:
- **Persistent Storage**: All media files are stored in MinIO object storage
- **Scalable Architecture**: Handles large video files and multiple concurrent requests
- **Caching Layer**: Intelligent caching with database metadata
- **URL Access**: Presigned URLs for secure file access
- **Cleanup Management**: Automated cleanup of old files

## Configuration

### Environment Variables

Add these variables to your `.env` file:

```env
# MinIO Configuration
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_USE_SSL=false
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET_NAME=whatsapp-media
```

### MinIO Setup

1. **Install MinIO** (if not already installed):
   ```bash
   # Using Docker
   docker run -p 9000:9000 -p 9001:9001 \
     -e "MINIO_ROOT_USER=minioadmin" \
     -e "MINIO_ROOT_PASSWORD=minioadmin" \
     minio/minio server /data --console-address ":9001"
   ```

2. **Access MinIO Console**: http://localhost:9001
   - Username: `minioadmin`
   - Password: `minioadmin`

## Architecture

### File Organization

```
whatsapp-media/
├── video/
│   ├── {mediaKey}_{timestamp}.mp4          # Original videos
│   ├── segments/
│   │   └── {mediaKey}_{timestamp}_segment_{index}.mp3  # Audio segments
│   └── frames/
│       └── {mediaKey}_{timestamp}_frame_{index}.jpg    # Video frames
├── audio/
│   └── {mediaKey}_{timestamp}.mp3          # Extracted audio
├── image/
│   ├── {mediaKey}_{timestamp}.jpg          # JPEG images
│   └── {mediaKey}_{timestamp}.png          # PNG images
└── pdf/
    └── {mediaKey}_{timestamp}.pdf          # PDF documents
```

### Processing Flow

```
WhatsApp Message → Parse Message → Check Cache → Process Media
                                      ↓
                              Upload to MinIO → Cache Metadata
                                      ↓
                              Return Results with MinIO URLs
```

## Features

### 1. Video Processing

- **Original Video**: Stored as MP4 in `video/` folder
- **Audio Extraction**: Converted to MP3 and stored in `audio/` folder
- **Audio Segments**: Split into 60-second segments for transcription
- **Frame Extraction**: Screenshots every 5 seconds for OCR analysis

### 2. Image Processing

- **Direct Upload**: Images uploaded directly to MinIO
- **OCR Processing**: Text extraction using Tesseract
- **AI Analysis**: GPT-4 Vision analysis for content understanding

### 3. PDF Processing

- **Document Storage**: PDFs stored in `pdf/` folder
- **Text Extraction**: Parsed content cached for quick access

### 4. Caching Strategy

- **Multi-level Caching**: Database + MinIO + Local filesystem
- **Metadata Caching**: File information cached in database
- **URL Caching**: Presigned URLs cached for performance
- **Result Caching**: Parsed results cached to avoid reprocessing

## Usage

### Management Commands

```bash
# List all files in MinIO
npm run minio list

# List files with prefix
npm run minio list video/

# Get file information
npm run minio info video/abc123.mp4

# Delete a file
npm run minio delete video/abc123.mp4

# Cleanup old files (older than 7 days)
npm run minio cleanup 7

# Show statistics
npm run minio stats

# Sync cache with database
npm run minio sync
```

### API Integration

The system automatically:
1. Uploads all media to MinIO during processing
2. Returns MinIO URLs in processing results
3. Uses MinIO URLs for transcription and analysis
4. Caches metadata for quick access

## Benefits

### Performance
- **Reduced Disk Usage**: Files stored in MinIO, not local filesystem
- **Faster Processing**: Parallel uploads and downloads
- **Scalable Storage**: No local disk space limitations

### Reliability
- **Persistent Storage**: Files survive application restarts
- **Backup Ready**: MinIO can be backed up independently
- **High Availability**: MinIO can be clustered for redundancy

### Security
- **Presigned URLs**: Time-limited access to files
- **Access Control**: MinIO provides fine-grained permissions
- **Audit Trail**: All file operations logged

## Monitoring

### Health Checks

The system includes health checks for:
- MinIO connectivity
- Bucket existence
- File upload/download operations
- Cache synchronization

### Metrics

Track these metrics:
- File upload/download success rates
- Storage usage by file type
- Cache hit/miss ratios
- Processing times

## Troubleshooting

### Common Issues

1. **Connection Errors**
   ```bash
   # Check MinIO is running
   curl http://localhost:9000/minio/health/live
   ```

2. **Permission Errors**
   ```bash
   # Verify credentials in .env
   # Check bucket exists
   npm run minio list
   ```

3. **Storage Issues**
   ```bash
   # Check available space
   npm run minio stats
   
   # Cleanup old files
   npm run minio cleanup 30
   ```

### Logs

Monitor these log patterns:
- `✅ Uploaded to MinIO`: Successful uploads
- `❌ Failed to upload`: Upload failures
- `✅ Retrieved from MinIO`: Successful downloads
- `File not found in MinIO`: Missing files

## Future Enhancements

1. **Compression**: Automatic compression for large files
2. **CDN Integration**: CloudFront/Akamai for global access
3. **Encryption**: Server-side encryption for sensitive files
4. **Lifecycle Policies**: Automatic file deletion based on age
5. **Replication**: Cross-region replication for disaster recovery
