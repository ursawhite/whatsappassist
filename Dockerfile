# Multi-stage Dockerfile for whatsappassist on Alpine Linux

# ===================================================================================
# STAGE 1: Builder
# Purpose: Install build tools, all dependencies, and build the TypeScript project.
# ===================================================================================
FROM node:20-alpine AS builder

ENV NODE_ENV=development \
    PUPPETEER_SKIP_DOWNLOAD=true \
    NPM_CONFIG_LOGLEVEL=warn

WORKDIR /app

# --- FIX 1: Use Alpine's 'apk' package manager ---
# Install system dependencies required for building native modules using apk.
RUN apk add --no-cache \
    ca-certificates \
    git \
    openssl \
    python3 \
    make \
    g++

# Install Node.js dependencies, leveraging layer caching

COPY package*.json ./
RUN npm install

# Copy all source files
COPY tsconfig.json ./
COPY prisma ./prisma
COPY src ./src
RUN npx prisma generate

# --- FIX 2: Generate Prisma Client ---
# Ensure Prisma Client is generated before the build process.

# Build the TypeScript project
RUN npm run build


# ===================================================================================
# STAGE 2: Runtime
# Purpose: Create a slim, secure production image with only necessary Alpine packages.
# ===================================================================================
FROM node:20-alpine AS runtime

ENV NODE_ENV=production \
    # --- FIX 3: Set Puppeteer path for Alpine's Chromium ---
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser \
    PUPPETEER_SKIP_DOWNLOAD=true \
    PORT=3000

WORKDIR /app

# --- FIX 4: Install Alpine-specific runtime packages ---
# Enable the Community repository for Chromium and install all necessary packages.
RUN echo "http://dl-cdn.alpinelinux.org/alpine/v3.18/community" >> /etc/apk/repositories && \
    apk update && \
    apk add --no-cache \
    # For Puppeteer
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    udev \
    # For other dependencies
    ffmpeg \
    tesseract-ocr \
    # FIX 5: Use the tesseract data package instead of copying files
    tesseract-ocr-data-eng \
    openssl


# Copy application files from the builder stage and set correct ownership
COPY --from=builder --chown=node:node /app/package*.json ./
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --from=builder --chown=node:node /app/prisma ./prisma

# --- FIX 6: Create assets directory structure with proper permissions ---
RUN mkdir -p /app/assets/video /app/assets/audio /app/assets/frames /app/assets/images && \
    chown -R node:node /app/assets && \
    chmod -R 755 /app/assets

# --- FIX 7: Switch User at the End for Security ---
# Switch to the non-root 'node' user after all root operations are complete.
USER node

# Expose the application port
EXPOSE 3000


# Healthcheck to verify the server is running
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD node -e "fetch('http://localhost:'+(process.env.PORT||3000)+'/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))" || exit 1

# The command to start the application
CMD ["npm", "start"]