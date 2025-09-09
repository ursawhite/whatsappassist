import OpenAI from "openai";
import {
  GOOGLE_CSE_ID,
  GOOGLE_SEARCH_API_KEY,
  OPEN_API_KEY,
  GROQ_API_KEY,
} from "../utils/env.js";
import { ResponseAI } from "../types";
import { promptData } from "../utils/prompt";
import axios from "axios";
import { SourceDomainService } from "./source_domain_service";

const FACT_CHECK_SITES = [
  "*.komdigi.go.id",
  "*.kompas.com",
  "*.kompas.tv",
  "*.kompas.co.id",
  "*.kompas.id",
];
import { Groq } from "groq-sdk";

export const AI_AGENT = new OpenAI({
  apiKey: OPEN_API_KEY,
});

export const GROQ_CLIENT = new Groq({
  apiKey: GROQ_API_KEY,
});



export const askingAI = async ({
  input,
  prompt = "",
}: {
  input: string;
  prompt?: string;
}): Promise<string> => {
  try {    
    const response = await AI_AGENT.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: prompt,
        },
        {
          role: "user",
          content: input,
        },
      ],
      temperature: 0.3,
      top_p: 1,
    });

    const content = response.choices[0].message?.content || "";

    return content;
  } catch (err) {
    console.error("❌ Error:", err);
    throw new Error("error asking ai");
  }
};



export const askingGrok = async ({
  input,
  prompt = "",
}: {
  input: string;
  prompt?: string;
}): Promise<string> => {
  try {
    console.log("Prompt: ", prompt);
    console.log("Input: ", input);
    
    // Get domains from database
    const includeDomains = await SourceDomainService.getActiveDomains();
    console.log("🔍 Using domains from database:", includeDomains);
    
    const response = await GROQ_CLIENT.chat.completions.create({
      model: "compound-beta",
      messages: [
        {
          role: "system",
          content: "Sertakan sumber artikel yang relevan,dan kesimpulan yang relevan",
        },
        {
          role: "assistant",
          content: prompt,
        },
        {
          role: "user",
          content: input,
        },
      ],
      top_p: 1,
      stream: false,
      temperature: 0.3, 
      search_settings: {
        include_domains: includeDomains,
      }

    });


    


    return response.choices[0].message?.content || "";
  } catch (err) {
    console.error("❌ Error asking Groq:", err);
    throw new Error("error asking groq");
  }
};


export async function searchArticleWithGoogleAndAI(
  summary: string
): Promise<{ summerize: string; source: any[] }> {
  try {
    let allArticles: any[] = [];
    // ... (kode pencarian artikel Anda yang sudah ada tetap di sini)

    // --- BLOK LOGIKA BARU JIKA TIDAK ADA ARTIKEL DITEMUKAN ---
    if (!allArticles.length) {
      console.log("⚠️ Tidak ada artikel yang ditemukan dari sumber manapun.");
      
      const queryForPrompt = summary
        .replace(/@\d+/g, '')
        .replace(/sairing/gi, '')
        .replace(/[^\w\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      const noArticlesPrompt = `
[PERAN]
Anda adalah "sAIring", sebuah AI asisten yang bijaksana dan berhati-hati. Anda tidak dapat menemukan artikel dari media terpercaya terkait klaim pengguna.

[KONTEKS]
KLAIM PENGGUNA: "${queryForPrompt}"

[TUGAS UTAMA]
1.  **Akui Keterbatasan:** Jelaskan dengan jujur bahwa Anda tidak menemukan artikel berita yang relevan dari sumber media terpercaya yang bisa digunakan untuk memverifikasi klaim ini.
2.  **Berikan Analisis Umum:** Berdasarkan pengetahuan umum Anda, berikan pandangan umum yang netral mengenai klaim tersebut.
3.  **Sarankan Langkah Kewaspadaan:** Anjurkan pengguna untuk bersikap sangat kritis dan berhati-hati terhadap informasi yang belum terverifikasi seperti ini. Sarankan untuk tidak langsung membagikannya.
4.  **Ajak Mencari Sumber Lain:** Sarankan pengguna untuk memeriksa informasi ini langsung dari sumber resmi (misalnya situs web pemerintah, organisasi terkait, atau para ahli).

[ATURAN PENTING]
- **JANGAN PERNAH** memberikan kesimpulan FAKTA atau HOAX.
- Selalu tekankan bahwa analisis Anda bersifat umum dan bukan merupakan hasil verifikasi.
- Gunakan bahasa yang santai, membantu, dan tidak menghakimi.
- Jika tidak ada artikel yang ditemukan, jangan memberikan kesimpulan FAKTA atau HOAX.
- selalu sertakan sumber artikel yang relevan, dan kesimpulan yang relevan
      `.trim();

      const analysisWithoutArticles = await askingGrok({
        input: queryForPrompt,
        prompt: promptData.checkHoaxWithoutArticles,
      });

      return { summerize: analysisWithoutArticles, source: [] };
    } 
    // --- AKHIR BLOK LOGIKA BARU ---
    return { summerize: "", source: [] };

  } catch (error: any) {
    console.error("Gagal menganalisis dengan AI:", error.response?.data || error.message);
    throw error;
  }
}

export const askingGrokWithMedia = async ({
  input,
  prompt = "",
  mediaUrl = "",
}: {
  input: string;
  prompt?: string;
  mediaUrl?: string;
}): Promise<string> => {
  try {
    console.log("Prompt: ", prompt);
    console.log("Input: ", input);
    
    // Get domains from database
    const includeDomains = await SourceDomainService.getActiveDomains();
    console.log("🔍 Using domains from database:", includeDomains);
    
    const response = await GROQ_CLIENT.chat.completions.create({
      model: "compound-beta",
      messages: [
        {
          role: "assistant",
          content: prompt,
        },
        {
          role: "system",
          content: "Sertakan sumber artikel yang relevan,dan kesimpulan yang relevan",
        },
        {
          role: "user",
          content: [
            { type: "image_url", image_url: {url: mediaUrl} },
            { type: "text", text: input },
          ],
        },
      ],
      top_p: 1,
      stream: false,
      temperature: 0.3, 
      search_settings: {
        include_domains: includeDomains,
      }

    });


    


    return response.choices[0].message?.content || "";
  } catch (err) {
    console.error("❌ Error asking Groq:", err);
    throw new Error("error asking groq");
  }
};