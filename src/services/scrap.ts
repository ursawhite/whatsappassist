import puppeteer, { type Browser, type Page } from 'puppeteer';
import { extract } from '@extractus/article-extractor';

// --- Singleton Browser Instance ---
// Kita hanya akan membuat SATU instance browser dan menggunakannya kembali.
// Ini jauh lebih efisien daripada membuat browser baru untuk setiap permintaan.
let browser: Browser | null = null;

// --- Rate Limiting and Retry Logic ---
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 2000; // 2 seconds between requests

async function waitForRateLimit(): Promise<void> {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  
  if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
    const waitTime = MIN_REQUEST_INTERVAL - timeSinceLastRequest;
    console.log(`⏳ Menunggu ${waitTime}ms untuk rate limiting...`);
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }
  
  lastRequestTime = Date.now();
}

/**
 * Initializes a single, persistent Puppeteer browser instance.
 * This should be called once when the application starts.
 */
export async function initializeBrowser(): Promise<void> {
  if (browser) return; // Already initialized
  try {
    console.log('-> Menginisialisasi instance browser...');
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage', // Penting untuk lingkungan Docker/Linux
        '--disable-gpu',
        '--no-zygote',
      ],
    });
    console.log('✅ Browser berhasil diinisialisasi.');
  } catch (error) {
    console.error('❌ Gagal menginisialisasi browser:', error);
    throw error; // Throw error to prevent server from starting in a bad state
  }
}

/**
 * Closes the persistent browser instance.
 * This should be called during graceful shutdown.
 */
export async function closeBrowser(): Promise<void> {
  if (browser) {
    console.log('-> Menutup instance browser...');
    await browser.close();
    browser = null;
    console.log('✅ Browser berhasil ditutup.');
  }
}

/**
 * Fetches and extracts the main content of an article from a URL.
 * It uses a smart extractor instead of relying on fixed CSS selectors.
 * * @param url The URL of the article to scrape.
 * @returns An object containing the article's title and content.
 */
export const getArticle = async (url: string): Promise<{ title: string; content: string }> => {
  if (!browser) {
    throw new Error('Browser is not initialized. Please call initializeBrowser() first.');
  }

  let page: Page | null = null;

  try {
    console.log(`📰 Memproses artikel dari: ${url}`);
    page = await browser.newPage();

    // Mengoptimalkan request: blokir gambar, stylesheet, dan font
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const resourceType = req.resourceType();
      if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
        req.abort();
      } else {
        req.continue();
      }
    });

    // Pergi ke halaman dengan timeout yang wajar
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });

    // Dapatkan HTML yang sudah dirender oleh JavaScript
    const html = await page.content();

    // Gunakan extractor cerdas untuk mendapatkan konten
    const article = await extract(html);

    if (!article || !article.content) {
      console.warn(`⚠️ Konten tidak ditemukan untuk ${url}`);
      return {
        title: '',
        content: '',
      };
    }

    // Membersihkan konten dari spasi berlebih dan baris baru ganda
    const cleanContent = article.content
      .replace(/<[^>]+>/g, ' ') // Hapus sisa tag HTML
      .replace(/\s\s+/g, ' ')   // Ganti spasi ganda dengan tunggal
      .trim();

    return {
      title: article.title || 'Judul tidak ditemukan',
      content: cleanContent,
    };

  } catch (err) {
    console.error(`❌ Gagal memproses artikel dari ${url}:`, err);
    // Memberikan pesan error yang lebih spesifik
    if (err instanceof Error && err.message.includes('timeout')) {
        throw new Error('Gagal memuat halaman: Waktu habis (Timeout).');
    }
    throw new Error(`Gagal mengambil artikel. Silakan periksa URL dan coba lagi.`);
  } finally {
    // Selalu tutup halaman untuk membebaskan memori
    if (page) {
      await page.close();
    }
  }
};
