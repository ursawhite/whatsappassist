import { 
  makeWASocket,
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  downloadMediaMessage,
  type proto,
  type WASocket,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import qrcode from 'qrcode-terminal';
import qrcodeDataURL from 'qrcode';
import pino from 'pino';

// Import your helper functions
import {  searchArticleWithGoogleAndAI, askingGrok ,askingAI} from "./ai_agent";
import { parseMessage } from "./parser";
import { promptData } from "../utils/prompt";
import { getArticle } from "./scrap";
import { isKnownGroup, addKnownGroup } from '../utils/db_group_cache';
import { db } from './database';
import { BufferJSON, initAuthCreds, makeCacheableSignalKeyStore, type AuthenticationCreds, type SignalDataTypeMap } from '@whiskeysockets/baileys';

// --- CONFIGURATION ---
const INTRO_MESSAGE: string = `👋 Halo, perkenalkan saya *sAIring*, teman AI kamu yang bisa menyaring setiap pernyataan, artikel, video, dan gambar yang ingin kamu tanyakan kebenarannya.

📱 Cara menggunakan:
1. Kirim pesan dengan awalan "sairing" diikuti informasi yang ingin dicek
2. Kirim gambar atau video dengan caption atau mention "sairing"
3. Reply/balas pesan yang ingin dicek dan tambahkan kata "sairing"
4. Forward/teruskan pesan yang ingin dicek dan tambahkan kata "sairing"

✨ Contoh:
sairing apakah benar ada bantuan dana dari pemerintah?

🤖 Saya akan membantu mengecek informasi dari sumber-sumber terpercaya dan memberikan hasil analisisnya kepada Anda.

*Mari sAIring sebelum sharing!*`;

const GREETING_WORDS: string[] = ['halo', 'hi', 'hello', 'hay', 'hei', 'hey', 'assalamualaikum', 'p', 'pagi', 'siang', 'sore', 'malam'];
const TRIGGER_KEYWORD: string = "sairing";

// Global variables for QR code and connection status
let currentQRCode: string | null = null;
let connectionStatus: string = 'disconnected';

// --- HELPER FUNCTIONS ---
// NOTE: Your existing helper functions (extractUrls, handleTextFromString)
// should be placed here.

function extractUrls(text: string): string[] {
  const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi;
  return text.match(urlRegex) || [];
}

const isSocialMediaUrl = (url: string): boolean => {
  // Ensure the input is a valid string before checking
  if (typeof url !== 'string') {
    return false;
  }
  
  return url.includes('instagram') || url.includes('tiktok') || url.includes('youtube');
};

async function handleTextFromString(text: string): Promise<string> {
  const rawQuery = text.replace(new RegExp(TRIGGER_KEYWORD, "gi"), "").trim();
  if (!rawQuery) return "Mohon sertakan pertanyaan atau konteks setelah kata kunci.";

  const urls = extractUrls(rawQuery);
  if (urls.length > 0) {
      const url = urls[0];
      // if (isSocialMediaUrl(url)) {
      //   const postedAccount = await getSocialMediaPost(url);
      //   if (postedAccount.author && postedAccount.caption && postedAccount.mediaUrl) {
      //     let input = `
      //     author: ${postedAccount.author}
      //     caption: ${postedAccount.caption}
      //     `
      //     return askingGrok({ input: input, prompt: promptData.checkHoaxWithoutArticles });
      //   }
      // }
      
      const summary = await getArticle(url);
      if (!summary.title && !summary.content) {
          return askingGrok({ input: rawQuery, prompt: promptData.prompFromUrl });
      }
      const cleanContent = await askingGrok({ input: `ambil bagan content nya ${summary.content}` });
      return askingGrok({ input: `title : ${summary.title}, content:${cleanContent}`, prompt: promptData.checkHoax });
  }
  return askingGrok({ input: rawQuery, prompt: promptData.prompFromUrl });
}

// --- DB-Backed Auth State ---
async function useDbAuthState() {
  const prisma: any = db as any;
  const row = await prisma.waSession.findUnique({ where: { id: 'default' } });
  // Properly revive Buffers using BufferJSON with JSON.parse/JSON.stringify
  const creds: AuthenticationCreds = row
    ? (JSON.parse(JSON.stringify(row.creds), BufferJSON.reviver) as AuthenticationCreds)
    : initAuthCreds();
  const keyStore: Record<string, Record<string, any>> = row
    ? (JSON.parse(JSON.stringify(row.keys), BufferJSON.reviver) as Record<string, Record<string, any>>)
    : {};

  const saveAll = async () => {
    await prisma.waSession.upsert({
      where: { id: 'default' },
      // Store as plain JSON with Buffers serialized via BufferJSON.replacer
      update: {
        creds: JSON.parse(JSON.stringify(creds, BufferJSON.replacer)) as any,
        keys: JSON.parse(JSON.stringify(keyStore, BufferJSON.replacer)) as any,
      },
      create: {
        id: 'default',
        creds: JSON.parse(JSON.stringify(creds, BufferJSON.replacer)) as any,
        keys: JSON.parse(JSON.stringify(keyStore, BufferJSON.replacer)) as any,
      },
    });
  };

  return {
    state: {
      creds,
      keys: makeCacheableSignalKeyStore(
        {
          get: async (type: keyof SignalDataTypeMap, ids: string[]) => {
            const data = keyStore[type] || {};
            const result: Record<string, any> = {};
            for (const id of ids) if (id in data) result[id] = data[id];
            return result;
          },
          set: async (data: any) => {
            for (const type of Object.keys(data)) {
              keyStore[type] = keyStore[type] || {};
              Object.assign(keyStore[type], data[type]);
            }
            await saveAll();
          },
        },
        pino({ level: 'silent' })
      ),
    },
    saveCreds: saveAll,
  } as any;
}

// --- BOT STATE AND EXPORTS ---
let sock: WASocket | undefined;
let connectionState: string = 'closed';
let retryCount: number = 0;
const MAX_RETRIES: number = 5;
const BASE_DELAY: number = 5000; // 5 seconds

export const getWASocket = (): WASocket | undefined => sock;
export const isWAConnected = (): boolean => connectionState === 'open';

// Export functions to get QR code and connection status
export function getQRCode(): string | null {
    return currentQRCode;
}

export function getConnectionStatus(): string {
    return connectionStatus;
}

// Function to properly logout and destroy WhatsApp session
export async function logoutWhatsApp(): Promise<void> {
    try {
        console.log('🚪 Logging out WhatsApp session...');
        
        if (sock) {
            // Properly logout from WhatsApp
            await sock.logout();
            console.log('✅ WhatsApp session logged out successfully');
        }
        
        // Clear the database session
        const prisma: any = db as any;
        await prisma.waSession.delete({ where: { id: 'default' } });
        console.log('✅ Database session cleared');
        
        // Reset global variables
        sock = undefined;
        connectionState = 'closed';
        currentQRCode = null;
        connectionStatus = 'disconnected';
        retryCount = 0;
        
        console.log('✅ All session data cleared');
    } catch (error) {
        console.error('❌ Error during logout:', error);
        throw error;
    }
}

// --- MAIN BOT FUNCTION ---
export async function startWhatsAppBot(retryAttempt: number = 0): Promise<void> {
  try {
    // Reset retry count on successful connection
    if (retryAttempt === 0) {
      retryCount = 0;
    }
    
    const { state, saveCreds } = await useDbAuthState();
    const { version, isLatest } = await fetchLatestBaileysVersion();
    console.log(`-> Menggunakan WA v${version.join('.')}, latest: ${isLatest}${retryAttempt > 0 ? ` (Retry ${retryAttempt}/${MAX_RETRIES})` : ''}`);

    sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        connectTimeoutMs: 60_000,
        keepAliveIntervalMs: 25_000,
    });

  sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;
      connectionState = connection ?? 'closed';

      if (qr) {
          console.log("📱 QR code received. Scan it with WhatsApp.");
          qrcode.generate(qr, { small: true });
          
          // Generate QR code as data URL for web display
          try {
              const qrDataURL = await qrcodeDataURL.toDataURL(qr, { 
                  width: 300,
                  margin: 2,
                  color: {
                      dark: '#000000',
                      light: '#FFFFFF'
                  }
              });
              currentQRCode = qrDataURL;
              connectionStatus = 'qr_ready';
              console.log("✅ QR code generated for web display");
          } catch (error) {
              console.error("❌ Error generating QR code for web:", error);
          }
      }
      if (connection === 'close') {
          const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
          const isLoggedOut = statusCode === DisconnectReason.loggedOut;
          const shouldReconnect = !isLoggedOut;
          console.log('-> Koneksi terputus:', lastDisconnect?.error, ', menyambungkan kembali:', shouldReconnect);
          
          if (isLoggedOut) {
              console.warn('⚠️ Session invalidated (logged out). Clearing DB session...');
              const prisma: any = db as any;
              prisma.waSession.delete({ where: { id: 'default' } })
                .then(() => console.log('✅ DB session cleared'))
                .catch((err: any) => console.error('❌ Failed clearing DB session:', err))
                .finally(() => {
                  retryCount = 0;
                  // Restart fresh to show QR again
                  setTimeout(() => startWhatsAppBot(0), 1000);
                });
              return;
          }
          
          if (shouldReconnect && retryCount < MAX_RETRIES) {
              retryCount++;
              const delay = BASE_DELAY * Math.pow(2, retryCount - 1); // Exponential backoff
              console.log(`🔄 Mencoba menyambungkan kembali dalam ${delay/1000} detik... (Percobaan ${retryCount}/${MAX_RETRIES})`);
              
              setTimeout(() => {
                  startWhatsAppBot(retryCount);
              }, delay);
          } else if (retryCount >= MAX_RETRIES) {
              console.error('❌ Maksimum percobaan reconnection tercapai. Bot berhenti mencoba.');
              process.exit(1);
          }
      } else if (connection === 'open') {
          console.log('✅ Bot WhatsApp siap digunakan!');
          currentQRCode = null; // Clear QR code when connected
          connectionStatus = 'connected';
          retryCount = 0; // Reset retry count on successful connection
      }
  });

  sock.ev.on('creds.update', saveCreds);

  // ## MAIN MESSAGE HANDLER LOGIC ##
  sock.ev.on('messages.upsert', async (m) => {
      const msg = m.messages[0];

      // Basic validation to ignore irrelevant updates
      if (!msg.message || msg.key.fromMe) {
          return;
      }

      const senderJid = msg.key.remoteJid;
      if (!senderJid) return;

      // --- Variable Extraction ---
      const isGroup = senderJid.endsWith('@g.us');
      const botNumber = state.creds.me?.id.split(':')[0];
      const body = msg.message.conversation ?? msg.message.extendedTextMessage?.text ?? msg.message.imageMessage?.caption ?? msg.message.videoMessage?.caption ?? "";
      const lowerCaseBody = body.toLowerCase();
      
      const contextInfo = msg.message.extendedTextMessage?.contextInfo;
      const isQuoted = !!contextInfo?.quotedMessage;
      const mentionedJids = contextInfo?.mentionedJid ?? [];
      const isMentioned = mentionedJids.some(jid => jid.includes(botNumber!));
      const hasKeyword = lowerCaseBody.includes(TRIGGER_KEYWORD);

      // --- Trigger Validation ---
      const isAsking = hasKeyword || isMentioned;
      const isPrivateMessage = !isGroup; // Direct message (not in group)
      
      // Auto-reply to private messages, or require trigger keyword for group messages
      if (!isAsking && !isPrivateMessage) {
          return;
      }

      // --- Main Processing Block ---
      try {
          // 1. Handle Greetings
          const isGreeting = GREETING_WORDS.some(word => lowerCaseBody.startsWith(word));
          if (isGreeting) {
              console.log(`👋 Greeting terdeteksi dari ${senderJid}`);
              await sock!.sendMessage(senderJid, { text: INTRO_MESSAGE }, { quoted: msg });
              return;
          }

          // 2. Handle First Interaction in a Group
          if (isGroup && !(await isKnownGroup(senderJid)) && isMentioned) {
              const chat = await sock!.groupMetadata(senderJid);
              console.log(`✨ Interaksi pertama di grup "${chat.subject}". Mengirim perkenalan.`);
              await addKnownGroup(senderJid);
              await sock!.sendMessage(senderJid, { text: INTRO_MESSAGE });
              return;
          }

          // 3. Handle Private Messages (Auto-reply)
          if (isPrivateMessage && !isAsking) {
              console.log(`💬 Private message from ${senderJid} - auto-analyzing`);
              // For private messages, analyze all content automatically
              
              // Send welcome message for first-time private users (optional)
              if (!body.toLowerCase().includes('sairing')) {
                  console.log(`🤖 First-time private user ${senderJid} - sending welcome info`);
              }
          }

          // 3. Send "Processing" Message
          const processingMessage =  "Oke, kami cek sebentar ya..";
          await sock!.sendMessage(senderJid, { text: processingMessage }, { quoted: msg });

          // 4. Determine Message to Analyze (Current or Quoted)
          let response: string = "";
          let messageToAnalyze: proto.IWebMessageInfo = msg;

          if (isQuoted && contextInfo?.quotedMessage) {
               messageToAnalyze = {
                  key: { remoteJid: senderJid, id: contextInfo.stanzaId, participant: contextInfo.participant },
                  message: contextInfo.quotedMessage,
              };
          }
          
          // 5. Analyze Content (Media or Text)
          const hasMedia = !!(messageToAnalyze.message?.imageMessage || messageToAnalyze.message?.videoMessage);

          if (hasMedia) {
              console.log(`📥 Mengunduh media dari ${senderJid}`);
              const mediaBuffer = await downloadMediaMessage(
                messageToAnalyze,
                'buffer',
                {},
                { logger: pino({ level: 'silent' }), reuploadRequest: sock!.updateMediaMessage }
              ) as Buffer;
              const caption = messageToAnalyze.message?.imageMessage?.caption ?? messageToAnalyze.message?.videoMessage?.caption ?? body;
              // Pass proper message structure to parser for caching
              const parsed = await parseMessage({ 
                _data: { mediaKey: messageToAnalyze.key.id }, // Use message ID as media key
                media: { 
                  data: mediaBuffer.toString('base64'), 
                  mimetype: messageToAnalyze.message?.imageMessage ? 'image/jpeg' : 'video/mp4',
                  filename: 'media'
                }, 
                body: caption 
              });
              const messageContext = caption.replace(new RegExp(TRIGGER_KEYWORD, "gi"), "").trim();
              if (typeof parsed === 'string') {
                response = parsed;
              } else {
                const googleSearchQuery = await askingAI({ prompt: promptData.getHeadline, input: parsed.summary });
                const { summerize, source } = await searchArticleWithGoogleAndAI(googleSearchQuery);
                let hoaxCheck = summerize;
                if (!source || source.length === 0) {
                  hoaxCheck = await askingGrok({ prompt: promptData.checkHoaxWithoutArticles, input: parsed.summary });
                }
                response = messageContext ? `Konteks pesan: ${messageContext}\n\n${hoaxCheck}` : hoaxCheck;
              }
          } else {
              let combinedText = body;
              if (isQuoted) {
                  const quotedText = messageToAnalyze.message?.conversation ?? messageToAnalyze.message?.extendedTextMessage?.text ?? "";
                  combinedText = `${quotedText.trim()}\n${body.trim()}`.trim();
              }
              console.log(`📝 Menganalisis teks dari ${senderJid}`);
              response = await handleTextFromString(combinedText);
          }

          // 6. Send Final Response
          if (response) {
              await sock!.sendMessage(senderJid, { text: response });
          } else {
              await sock!.sendMessage(senderJid, { text: "Maaf, saya tidak dapat menemukan jawaban untuk pertanyaan Anda." });
          }

      } catch (error) {
          console.error('❌ Error selama analisis pesan:', error);
          await sock!.sendMessage(senderJid, { text: "Maaf, terjadi kesalahan internal saat memproses permintaan Anda." });
      }
  });
  } catch (error) {
    console.error('❌ Error initializing WhatsApp bot:', error);
    
    // Retry on initialization errors
    if (retryCount < MAX_RETRIES) {
      retryCount++;
      const delay = BASE_DELAY * Math.pow(2, retryCount - 1);
      console.log(`🔄 Mencoba menginisialisasi ulang dalam ${delay/1000} detik... (Percobaan ${retryCount}/${MAX_RETRIES})`);
      
      setTimeout(() => {
        startWhatsAppBot(retryCount);
      }, delay);
    } else {
      console.error('❌ Maksimum percobaan inisialisasi tercapai. Bot berhenti.');
      throw error;
    }
  }
}