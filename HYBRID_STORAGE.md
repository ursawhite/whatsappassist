# Hybrid Storage Approach

This document explains the hybrid storage approach implemented for WhatsApp media processing.

## Overview

The system now uses a **hybrid approach** that combines:
- **MinIO Object Storage**: Primary storage for all media files
- **Local Temp Directory**: Temporary processing workspace
- **Auto-cleanup**: Automatic removal of temp files after processing

## Architecture

### Storage Strategy

```
WhatsApp Media → Temp Directory → Process → Upload to MinIO → Cleanup Temp
```

### File Flow

1. **Initial Storage**: Media saved to temp directory for processing
2. **Processing**: FFmpeg and other tools work with local files
3. **Upload**: Processed files uploaded to MinIO
4. **Cleanup**: Temp files automatically removed
5. **Caching**: MinIO URLs cached for future access

## Benefits

### ✅ **Efficient Processing**
- FFmpeg works with local files (faster than network)
- No disk space accumulation
- Automatic cleanup prevents disk bloat

### ✅ **Reliable Storage**
- All files permanently stored in MinIO
- Survives application restarts
- Scalable storage solution

### ✅ **Performance Optimized**
- Local processing for speed
- MinIO URLs for sharing
- Smart caching strategy

## Implementation Details

### Temp Directory Structure

```
temp/
├── {mediaKey}_timestamp/
│   ├── {mediaKey}.mp4          # Original video
│   ├── {mediaKey}.mp3          # Extracted audio
│   └── segments/
│       ├── output_000.mp3      # Audio segments
│       ├── output_001.mp3
│       └── ...
└── video_timestamp/
    ├── {timestamp}.mp4         # Video for frame extraction
    └── frames/
        ├── frame-1.jpg         # Extracted frames
        ├── frame-2.jpg
        └── ...
```

### Processing Flow

#### Video Processing
```typescript
// 1. Save to temp
const tempDir = path.join(process.cwd(), 'temp', filePrefix);
fs.writeFileSync(videoPath, videoBuffer);

// 2. Upload to MinIO
await minioService.uploadFile(videoObjectName, videoPath, 'video/mp4');

// 3. Process with FFmpeg
Ffmpeg(videoPath).save(audioPath);

// 4. Upload results to MinIO
await minioService.uploadFile(audioObjectName, audioPath, 'audio/mp3');

// 5. Cleanup temp
cleanupTempDirectory(tempDir);
```

#### Image Processing
```typescript
// 1. Upload directly to MinIO (no temp needed)
await minioService.uploadBuffer(imageObjectName, imageBuffer, 'image/jpeg');

// 2. Process from memory
const textFromOCR = await extractTextFromImage(imageBuffer);
const imageAnalysis = await analyzeImageWithGPT4(imageBuffer);
```

#### PDF Processing
```typescript
// 1. Upload directly to MinIO
await minioService.uploadBuffer(pdfObjectName, pdfBuffer, 'application/pdf');

// 2. Process from memory
const summary = await parsePDF(pdfBuffer);
```

## Cleanup Strategy

### Automatic Cleanup
- **Runtime Cleanup**: After each processing step
- **Scheduled Cleanup**: Every hour for old temp directories
- **Error Cleanup**: On processing failures

### Manual Cleanup
```bash
# Cleanup temp directories
npm run cleanup

# Cleanup old MinIO files
npm run minio cleanup 7
```

## Caching Strategy

### Multi-level Caching
1. **Parsed Results**: Final analysis results (7 days)
2. **MinIO URLs**: File access URLs (24 hours)
3. **Metadata**: File information (24 hours)

### Cache Keys
- `{mediaKey}_segments_urls`: Audio segment URLs
- `{mediaKey}_frame_urls`: Video frame URLs
- `{mediaKey}_ocr_results`: OCR analysis results
- `{mediaKey}_minio`: MinIO metadata

## Error Handling

### Graceful Degradation
- If MinIO is down: Continue with local processing
- If temp cleanup fails: Log error, continue
- If upload fails: Keep local copy temporarily

### Recovery
- Temp files cleaned up on next scheduled run
- Failed uploads retried on next access
- Cache entries marked as stale

## Monitoring

### Health Checks
- Temp directory size monitoring
- MinIO connectivity checks
- Cleanup job status

### Metrics
- Temp directory usage
- MinIO upload/download success rates
- Cleanup efficiency

## Configuration

### Environment Variables
```env
# MinIO Configuration
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_USE_SSL=false
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET_NAME=whatsapp-media
```

### Cleanup Settings
- **Temp Age Limit**: 24 hours (configurable)
- **Cleanup Interval**: 1 hour (configurable)
- **Max Temp Size**: No limit (auto-cleanup)

## Commands

### Management Commands
```bash
# Cleanup temp directories
npm run cleanup

# MinIO management
npm run minio list
npm run minio cleanup 7
npm run minio stats

# Cache management
npm run cache
```

### Development Commands
```bash
# Start with cleanup
npm run dev

# Test MinIO integration
npm run test:minio
```

## Best Practices

### 1. **Monitor Temp Usage**
- Check temp directory size regularly
- Monitor cleanup job logs
- Set up alerts for disk space

### 2. **Optimize Processing**
- Use appropriate temp directory locations
- Configure cleanup intervals based on usage
- Monitor MinIO performance

### 3. **Handle Errors**
- Implement retry logic for failed uploads
- Log cleanup failures for investigation
- Monitor MinIO connectivity

### 4. **Scale Considerations**
- Multiple instances can share MinIO
- Temp directories are instance-specific
- Consider shared temp storage for clusters

## Troubleshooting

### Common Issues

1. **Temp Directory Full**
   ```bash
   npm run cleanup
   # Check disk space
   df -h
   ```

2. **MinIO Upload Failures**
   ```bash
   # Check MinIO status
   curl http://localhost:9000/minio/health/live
   # Check connectivity
   npm run minio list
   ```

3. **Cleanup Not Working**
   ```bash
   # Manual cleanup
   npm run cleanup
   # Check logs for errors
   ```

### Performance Tuning

1. **Temp Directory Location**
   - Use fast storage (SSD) for temp
   - Consider RAM disk for high-frequency processing

2. **Cleanup Frequency**
   - Adjust based on processing volume
   - Monitor temp directory growth

3. **MinIO Configuration**
   - Optimize for your use case
   - Consider MinIO clustering for high availability
