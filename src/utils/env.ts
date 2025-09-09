import dotenv from "dotenv";
dotenv.config();

// Validate critical environment variables
const requiredEnvVars = {
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || process.env.OPEN_AI_KEY || process.env.OPEN_API_KEY,
  GOOGLE_SEARCH_API_KEY: process.env.GOOGLE_SEARCH_API_KEY,
  GOOGLE_CSE_ID: process.env.GOOGLE_CSE_ID,
  GROQ_API_KEY: process.env.GROQ_API_KEY,
};

// Check for missing critical variables
const missingVars = Object.entries(requiredEnvVars)
  .filter(([key, value]) => !value)
  .map(([key]) => key);

if (missingVars.length > 0) {
  console.error('🚨 Missing required environment variables:', missingVars.join(', '));
  console.error('Please set these variables in your .env file or environment');
  process.exit(1);
}

export const PORT = process.env.PORT || 3000;
export const OPEN_API_KEY = requiredEnvVars.OPENAI_API_KEY!;
export const OPENAI_API_KEY = requiredEnvVars.OPENAI_API_KEY!; // Consistent naming
export const GOOGLE_SEARCH_API_KEY = requiredEnvVars.GOOGLE_SEARCH_API_KEY!;
export const GOOGLE_CSE_ID = requiredEnvVars.GOOGLE_CSE_ID!;
export const GROQ_API_KEY = requiredEnvVars.GROQ_API_KEY!;

// MinIO Configuration
export const MINIO_CONFIG = {
  endpoint: process.env.MINIO_ENDPOINT || 'localhost',
  port: parseInt(process.env.MINIO_PORT || '9000'),
  useSSL: process.env.MINIO_USE_SSL === 'true',
  accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
  secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
  bucketName: process.env.MINIO_BUCKET_NAME || 'whatsapp-media'
};

// Export individual MinIO variables for convenience
export const MINIO_ENDPOINT = MINIO_CONFIG.endpoint;
export const MINIO_PORT = MINIO_CONFIG.port;
export const MINIO_USE_SSL = MINIO_CONFIG.useSSL;
export const MINIO_ACCESS_KEY = MINIO_CONFIG.accessKey;
export const MINIO_SECRET_KEY = MINIO_CONFIG.secretKey;
export const MINIO_BUCKET_NAME = MINIO_CONFIG.bucketName;
