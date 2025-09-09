import fs from "fs";
import { exec } from "child_process";
import { parsePDF } from "./pdf_parser";
import { analyzeImageWithGPT4 } from "./openai_service";
import Tesseract from "tesseract.js";
import Ffmpeg from "fluent-ffmpeg";

// @ts-ignore
import pdf from "pdf-extraction";
import path from "path";
import { fileURLToPath } from "url";
import { AI_AGENT, askingAI, askingGrok } from "./ai_agent";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function parseVideoToMP3toText(videoData: string, mediaKey?: string): Promise<string[]> {
  const timestamp = Date.now();
  const videoDir = path.join(__dirname, "../assets/video");
  const audioDir = path.join(__dirname, "../assets/audio");
  const filePrefix = mediaKey ? mediaKey.replace(/[^a-zA-Z0-9]/g, '_') : timestamp;
  const outputDir = path.join(audioDir, `${filePrefix}_segments`);

  // Buat folder jika belum ada
  if (!fs.existsSync(videoDir)) fs.mkdirSync(videoDir, { recursive: true });
  if (!fs.existsSync(audioDir)) fs.mkdirSync(audioDir, { recursive: true });
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const videoPath = path.join(videoDir, `${filePrefix}.mp4`);
  const audioPath = path.join(audioDir, `${filePrefix}.mp3`);

  // Check if we already have the audio segments cached
  if (mediaKey) {
    const cachedSegments = await dbMediaCache.get(`${mediaKey}_segments`);
    if (cachedSegments) {
      console.log('✅ Using cached audio segments');
      return cachedSegments;
    }
  }

  // Simpan video with error handling
  try {
    fs.writeFileSync(videoPath, Buffer.from(videoData, "base64"));
  } catch (fsError) {
    console.error("Error saving video file:", fsError);
    throw new Error("Gagal menyimpan file video. Mungkin disk penuh atau tidak ada izin akses.");
  }

  // Convert video ke mp3
  await new Promise<void>((resolve, reject) => {
    Ffmpeg(videoPath)
      .noVideo()
      .audioCodec("libmp3lame")
      .audioBitrate(128)
      .save(audioPath)
      .on("end", () => {
        console.log("✅ Konversi ke MP3 selesai");
        resolve();
      })
      .on("error", (err) => {
        console.error("❌ Error konversi MP3:", err.message);
        reject(err);
      });
  });

  // Split mp3 jadi potongan-potongan
  return new Promise((resolve, reject) => {
    const segmentDurationSec = 60;
    const outputPattern = path.join(outputDir, `output_%03d.mp3`);

    Ffmpeg(audioPath)
      .audioBitrate(128)
      .format("mp3")
      .outputOptions([
        `-f segment`,
        `-segment_time ${segmentDurationSec}`,
        `-reset_timestamps 1`,
      ])
      .on("end", async () => {
        console.log("✅ Split dan konversi selesai");
        const files = fs
          .readdirSync(outputDir)
          .filter((file) => file.endsWith(".mp3"))
          .map((file) => path.join(outputDir, file))
          .sort();
        // Cache the segments if we have a mediaKey
        if (mediaKey) {
          try {
            await dbMediaCache.set(`${mediaKey}_segments`, files);
            await dbMediaCache.setMetadata({
              mediaKey: `${mediaKey}_segments`,
              mimetype: 'audio/mp3',
              timestamp: new Date()
            });
          } catch (cacheError) {
            console.error("Error caching segments:", cacheError);
            // Continue with resolve even if caching fails
          }
        }
        resolve(files);
      })
      .on("error", (err) => {
        console.error("❌ Error saat split/konversi:", err.message);
        reject(err);
      })
      .save(outputPattern);
  });
}

// PDF parsing moved to pdf_parser.ts
export async function extractTextFromImage(imageData: string): Promise<string> {
  return new Promise((resolve, reject) => {
    Tesseract.recognize(Buffer.from(imageData, "base64"), "eng")
      .then(({ data: { text } }) => resolve(text))
      .catch(reject);
  });
}

import { dbMediaCache } from '../utils/db_media_cache';
import { promptData } from "../utils/prompt";

// Global error handler for unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection in parser:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception in parser:', error);
});

// File size limits to prevent OOM crashes
const MAX_VIDEO_SIZE = 100 * 1024 * 1024; // 100MB
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;  // 10MB
const MAX_PDF_SIZE = 50 * 1024 * 1024;    // 50MB

function validateFileSize(data: string, maxSize: number, fileType: string): boolean {
  const sizeInBytes = Buffer.from(data, 'base64').length;
  if (sizeInBytes > maxSize) {
    console.error(`File too large: ${sizeInBytes} bytes, max: ${maxSize} bytes for ${fileType}`);
    return false;
  }
  return true;
}

export async function parseMessage(message: any): Promise<any> {
  try {
    let media;
    let messageMediaKey: string | undefined;
    const rawData = (message as any)._data || {};

    // Accept directly provided media object (from Baileys pipeline)
    if ((message as any).media && (message as any).media.mimetype && (message as any).media.data) {
      media = (message as any).media;
    }

    // Check if we have cached media passed in
    if ((message as any).cachedMedia) {
      console.log("Using provided cached media");
      media = (message as any).cachedMedia;
    } else if (message.hasMedia) {
      // Get media key from the message
      messageMediaKey = rawData.mediaKey || rawData.quotedMsg?.mediaKey;
      console.log("messageMediaKey", messageMediaKey);
      // Try to get from cache first if we have a key
      if (messageMediaKey) {
        const cachedMedia = await dbMediaCache.get(messageMediaKey);
        if (cachedMedia) {
          console.log("Using cached media data");
          media = cachedMedia;
        }
      }

      // If not found in cache, try downloading
      if (!media) {
        console.log("Media not in cache or no key, downloading...");
        try {
          media = await message.downloadMedia();
          // Store in cache if we have a key
          if (media && messageMediaKey) {
            await dbMediaCache.set(messageMediaKey, media);
            await dbMediaCache.setMetadata({
              mediaKey: messageMediaKey,
              mimetype: media.mimetype,
              filename: media.filename,
              timestamp: new Date()
            });
          }
        } catch (err: any) {
          console.error("Error downloading media:", err);
          throw new Error("Failed to download media: " + (err.message || String(err)));
        }
      }
    }

    if (!media) {
      throw new Error("No media found in message");
    }

    // Validate file size based on media type to prevent OOM crashes
    let maxSize: number;
    let fileType: string;
    
    switch (media.mimetype) {
      case "video/mp4":
      case "video/quicktime":
        maxSize = MAX_VIDEO_SIZE;
        fileType = "video";
        break;
      case "image/jpeg":
      case "image/png":
        maxSize = MAX_IMAGE_SIZE;
        fileType = "image";
        break;
      case "application/pdf":
        maxSize = MAX_PDF_SIZE;
        fileType = "PDF";
        break;
      default:
        maxSize = MAX_IMAGE_SIZE; // Default to image size limit
        fileType = "file";
    }

    if (!validateFileSize(media.data, maxSize, fileType)) {
      throw new Error(`File terlalu besar. Maksimal ${Math.round(maxSize / 1024 / 1024)}MB untuk ${fileType}.`);
    }

    // Store metadata and media in cache if we have media
    if (media) {
      const mediaKeyToUse = rawData.mediaKey || (media as any).mediaKey;
      if (mediaKeyToUse) {
        // Store metadata
        await dbMediaCache.setMetadata({
          mediaKey: mediaKeyToUse,
          mimetype: media.mimetype,
          filename: media.filename,
          timestamp: new Date()
        });

        // Store media content
        await dbMediaCache.set(mediaKeyToUse, media);
      }
    }

    console.log("message", message);
    console.log("media", media);
    let summary = "";
    let frameFiles: string[] = [];
    let frameTexts = "";
    switch (media.mimetype) {
      case "video/mp4":
      case "video/quicktime":
        console.log("Processing video...");
        // Get timestamp from cache if available
        const mediaKeyToUse = rawData.mediaKey || (media as any).mediaKey;
        const metadata = mediaKeyToUse ? await dbMediaCache.getMetadata(mediaKeyToUse) : null;
        // Normalize timestamp that may be Date | string | number | undefined
        const rawTimestamp: any = metadata?.timestamp;
        const timestamp = (() => {
          if (!rawTimestamp) return Date.now();
          if (rawTimestamp instanceof Date) return rawTimestamp.getTime();
          if (typeof rawTimestamp === 'number') return rawTimestamp;
          if (typeof rawTimestamp === 'string') {
            const parsed = Date.parse(rawTimestamp);
            return isNaN(parsed) ? Date.now() : parsed;
          }
          return Date.now();
        })();
        const videoDir = path.join(__dirname, "../assets/video");
        const videoPath = path.join(videoDir, `${timestamp}.mp4`);
        const framesDir = path.join(__dirname, "../assets/frames", `${timestamp}`);

        // Check if we already have processed this video
        if (fs.existsSync(videoPath) && fs.existsSync(framesDir)) {
          console.log("Using existing processed video assets...");
          const frameFiles = fs.readdirSync(framesDir)
            .filter(file => file.endsWith('.jpg'))
            .map(file => path.join(framesDir, file));

          let frameTexts = '';
          for (const framePath of frameFiles) {
            const frameBuffer = fs.readFileSync(framePath);
            const frameText = await extractTextFromImage(frameBuffer.toString('base64'));
            if (frameText.trim()) {
              frameTexts += frameText + '\n\n';
            }
          }
          summary = frameTexts;
          break;
        }

        // Save video file for frame extraction if needed
        try {
          if (!fs.existsSync(videoDir)) {
            fs.mkdirSync(videoDir, { recursive: true });
          }
          if (!fs.existsSync(videoPath)) {
            // Check available disk space before writing
            const videoBuffer = Buffer.from(media.data, "base64");
            fs.writeFileSync(videoPath, videoBuffer);
            console.log(`✅ Video saved: ${videoPath} (${Math.round(videoBuffer.length / 1024 / 1024)}MB)`);
          }
        } catch (fsError) {
          console.error("File system error saving video:", fsError);
          throw new Error("Gagal menyimpan video. Mungkin disk penuh atau tidak ada izin akses.");
        }

        const dataText = await parseVideoToMP3toText(media.data, messageMediaKey);
        let allText = "";

        for (const filePath of dataText) {
          console.log("🔊 Transcribing:", filePath);
          const result = await AI_AGENT.audio.transcriptions.create({
            file: fs.createReadStream(filePath),
            model: "gpt-4o-transcribe",
            response_format: "text",
          });
          allText += result + "\n\n";
        }

        // Check if content is related to news/hoax
        const isNewsRelated = await askingAI({
          input: allText,
          prompt: "env. Return only 'YES' if it's related to news/claims that need verification, or 'NO' if it's just casual conversation, entertainment, or unrelated content."
        });

        if (isNewsRelated.trim() === 'NO') {
          console.log("Content not related to news/hoax, extracting frames...");

          // Check if we have cached frames and OCR results
          let frameFiles: string[] = [];
          let cachedOCRResults = '';
          
          if (messageMediaKey) {
            // Check for cached frames
            const cachedFrames = await dbMediaCache.get(`${messageMediaKey}_frames`);
            if (cachedFrames) {
              console.log('✅ Using cached video frames');
              frameFiles = cachedFrames;
              
              // Check for cached OCR results
              const cachedOCR = await dbMediaCache.get(`${messageMediaKey}_ocr_results`);
              if (cachedOCR) {
                console.log('✅ Using cached OCR results');
                cachedOCRResults = cachedOCR;
              }
            }
          }

          // Extract frames from video if not cached
          if (frameFiles.length === 0) {
            fs.mkdirSync(framesDir, { recursive: true });

            // Get video duration first
            const videoDuration = await new Promise<number>((resolve, reject) => {
              Ffmpeg.ffprobe(videoPath, (err, metadata) => {
                if (err) reject(err);
                resolve(metadata.format.duration || 0);
              });
            });

            // Calculate number of screenshots (one every 5 seconds)
            const screenshotCount = Math.max(1, Math.floor(videoDuration / 5));

            await new Promise<void>((resolve, reject) => {
              Ffmpeg(videoPath)
                .screenshots({
                  count: screenshotCount,
                  timemarks: Array.from({ length: screenshotCount }, (_, i) => i * 5), // take screenshot every 5 seconds
                  folder: framesDir,
                  filename: 'frame-%i.jpg'
                })
                .on('end', () => {
                  // Get list of generated frame files
                  frameFiles = fs.readdirSync(framesDir)
                    .filter(file => file.endsWith('.jpg'))
                    .map(file => path.join(framesDir, file));
                  resolve();
                })
                .on('error', (err) => reject(err));
            });
          }

          // If we don't have cached OCR results, process frames
          let frameTexts = cachedOCRResults;
          if (!frameTexts && frameFiles.length > 0) {
            frameTexts = '';
            for (const framePath of frameFiles) {
              const frameBuffer = fs.readFileSync(framePath);
              const frameBase64 = frameBuffer.toString('base64');
              
              // Extract text using OCR
              const frameText = await extractTextFromImage(frameBase64);
              
              // Analyze image with GPT-4 Vision
              const frameAnalysis = await analyzeImageWithGPT4(Buffer.from(frameBase64, 'base64'));
              
              if (frameText.trim() || frameAnalysis.trim()) {
                frameTexts += `Frame Analysis:\n${frameAnalysis}\n\nDetected Text:\n${frameText}\n\n---\n\n`;
              }
            }
            

          }
          summary = frameTexts;
          return { summary: frameTexts, frameFiles, frameTexts, mediaKey: messageMediaKey };
        } else {
          summary = allText;
          return { summary: allText, frameFiles: [], frameTexts: '', mediaKey: messageMediaKey };
        }

        break;
      case "image/jpeg":
      case "image/png":
        console.log("Processing image...");
        const textFromOCR = await extractTextFromImage(media.data);
        const imageAnalysis = await analyzeImageWithGPT4(media.data);
        summary = `Analisis Gambar:
${imageAnalysis}

Teks yang terdeteksi:
${textFromOCR}`;
        break;
      case "application/pdf":
        console.log("Processing PDF...");
        try {
          summary = await parsePDF(media.data).then((res) => res.text);
        } catch (err) {
          console.error("Gagal membaca PDF:", err);
          summary = "❌ File PDF tidak ditemukan atau gagal diproses.";
        }
        break;
      default:
        console.log("Unsupported media type:", media.mimetype);
        return "❌ Tipe media tidak didukung: " + media.mimetype;
    }
    console.log("summary", summary);
    return {
      summary: summary || "❌ Tidak ada konten yang dapat dianalisis dari media ini.",
      frameFiles: [],
      frameTexts: '',
      mediaKey: messageMediaKey
    };
  } catch (error) {
    console.error("Gagal membaca media:", error);
    return "❌ Gagal membaca media: ";
  }
}
