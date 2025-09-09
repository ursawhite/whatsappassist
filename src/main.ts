import express, { Request, Response } from "express";
import http from "http";
import cors from "cors";
import bodyParser from "body-parser";

import { PORT } from "./utils/env.js";
import { getArticle, initializeBrowser, closeBrowser } from "./services/scrap";
import { DatabaseService } from "./services/database";
import { startWhatsAppBot, isWAConnected, getQRCode, getConnectionStatus, logoutWhatsApp } from "./services/wa_client";
import { minioService } from "./services/minio_service";
import { cleanupTempDirectories } from "./scripts/cleanup_temp";

let server: http.Server;

// --- Penanganan Kesalahan & Graceful Shutdown (Sudah baik) ---
const gracefulShutdown = async () => {
    console.log('Sinyal shutdown diterima, menutup server HTTP...');
    server.close(async () => {
        console.log('Server HTTP ditutup.');
        await DatabaseService.getInstance().disconnect();
        console.log('Koneksi database ditutup.');
        await closeBrowser();
        console.log('Browser ditutup.');
        process.exit(0);
    });
};

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
});
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);


// --- Konfigurasi Aplikasi Express ---
const app = express();
app.use(cors({ credentials: true }));
app.use(bodyParser.json());


// --- Endpoint API ---

// Endpoint Health Check yang ditingkatkan
app.get("/health", async (req: Request, res: Response) => {
    try {
        const dbService = DatabaseService.getInstance();
        const dbHealthy = await dbService.healthCheck();
        
        res.json({
            status: "ok",
            timestamp: new Date().toISOString(),
            database: dbHealthy ? "connected" : "disconnected",
            whatsapp: isWAConnected() ? "connected" : "disconnected" // Cek status bot
        });
    } catch (error) {
        res.status(500).json({
            status: "error",
            timestamp: new Date().toISOString(),
            error: error instanceof Error ? error.message : "Unknown error"
        });
    }
});

app.post("/get-article", async (req: Request, res: Response) => {
    try {
        const { url } = req.body;
        if (!url) {
            return res.status(400).json({ message: "URL is required" });
        }
        const dataArticle = await getArticle(url);
        res.json({ data: dataArticle });
    } catch (err) {
        console.error("Error getting article:", err);
        res.status(500).json({ message: "Failed to get article" });
    }
});

// QR Code endpoint
app.get("/qr", (req: Request, res: Response) => {
    try {
        const qrCode = getQRCode();
        const status = getConnectionStatus();
        
        if (status === 'connected') {
            res.json({
                status: 'connected',
                message: 'WhatsApp is already connected',
                qrCode: null
            });
        } else if (qrCode) {
            res.json({
                status: 'qr_ready',
                message: 'Scan the QR code with WhatsApp',
                qrCode: qrCode
            });
        } else {
            res.json({
                status: 'waiting',
                message: 'Waiting for QR code...',
                qrCode: null
            });
        }
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: 'Failed to get QR code',
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

// QR Code status endpoint
app.get("/qr/status", (req: Request, res: Response) => {
    try {
        const status = getConnectionStatus();
        res.json({
            status: status,
            connected: status === 'connected',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: 'Failed to get status',
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

// Logout endpoint to destroy WhatsApp session
app.post("/logout", async (req: Request, res: Response) => {
    try {
        // Use the proper logout function that disconnects from WhatsApp
        await logoutWhatsApp();
        
        // Restart the WhatsApp bot to generate new QR code
        setTimeout(() => {
            startWhatsAppBot(0);
        }, 1000);
        
        res.json({
            status: 'success',
            message: 'WhatsApp session destroyed successfully. New QR code will be generated.',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to logout',
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

// QR Code HTML page
app.get("/qr-page", (req: Request, res: Response) => {
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>WhatsApp QR Code</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
            text-align: center;
            background-color: #f5f5f5;
        }
        .container {
            background: white;
            padding: 30px;
            border-radius: 10px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        .qr-container {
            margin: 20px 0;
            padding: 20px;
            border: 2px dashed #ddd;
            border-radius: 10px;
        }
        .qr-code {
            max-width: 300px;
            margin: 0 auto;
        }
        .status {
            margin: 20px 0;
            padding: 10px;
            border-radius: 5px;
            font-weight: bold;
        }
        .status.connected {
            background-color: #d4edda;
            color: #155724;
            border: 1px solid #c3e6cb;
        }
        .status.waiting {
            background-color: #fff3cd;
            color: #856404;
            border: 1px solid #ffeaa7;
        }
        .status.qr-ready {
            background-color: #d1ecf1;
            color: #0c5460;
            border: 1px solid #bee5eb;
        }
        .refresh-btn {
            background-color: #007bff;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 5px;
            cursor: pointer;
            font-size: 16px;
            margin-right: 10px;
        }
        .refresh-btn:hover {
            background-color: #0056b3;
        }
        .logout-btn {
            background-color: #dc3545;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 5px;
            cursor: pointer;
            font-size: 16px;
        }
        .logout-btn:hover {
            background-color: #c82333;
        }
        .logout-btn:disabled {
            background-color: #6c757d;
            cursor: not-allowed;
        }
        .instructions {
            margin: 20px 0;
            text-align: left;
            background-color: #f8f9fa;
            padding: 15px;
            border-radius: 5px;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>📱 WhatsApp QR Code</h1>
        <div id="status" class="status waiting">Checking connection status...</div>
        
        <div class="qr-container" id="qrContainer" style="display: none;">
            <h3>Scan QR Code with WhatsApp</h3>
            <div class="qr-code" id="qrCode"></div>
            <p>1. Open WhatsApp on your phone</p>
            <p>2. Go to Settings > Linked Devices</p>
            <p>3. Tap "Link a Device"</p>
            <p>4. Point your phone camera at the QR code</p>
        </div>
        
        <div class="instructions" id="instructions" style="display: none;">
            <h3>✅ WhatsApp Connected!</h3>
            <p>The bot is now ready to receive and process messages.</p>
            <p>You can close this page and start using the WhatsApp bot.</p>
        </div>
        
        <div class="button-container">
            <button class="refresh-btn" onclick="checkStatus()">🔄 Refresh Status</button>
            <button class="logout-btn" id="logoutBtn" onclick="logout()" disabled>🚪 Logout</button>
        </div>
    </div>

    <script>
        function checkStatus() {
            fetch('/qr')
                .then(response => response.json())
                .then(data => {
                    const statusDiv = document.getElementById('status');
                    const qrContainer = document.getElementById('qrContainer');
                    const instructions = document.getElementById('instructions');
                    const qrCode = document.getElementById('qrCode');
                    
                    statusDiv.className = 'status ' + data.status;
                    
                                         if (data.status === 'connected') {
                         statusDiv.textContent = '✅ WhatsApp Connected!';
                         qrContainer.style.display = 'none';
                         instructions.style.display = 'block';
                         document.getElementById('logoutBtn').disabled = false;
                     } else if (data.status === 'qr_ready') {
                         statusDiv.textContent = '📱 QR Code Ready - Scan with WhatsApp';
                         qrContainer.style.display = 'block';
                         instructions.style.display = 'none';
                         qrCode.innerHTML = '<img src="' + data.qrCode + '" alt="QR Code" style="max-width: 100%;">';
                         document.getElementById('logoutBtn').disabled = true;
                     } else {
                         statusDiv.textContent = '⏳ Waiting for QR code...';
                         qrContainer.style.display = 'none';
                         instructions.style.display = 'none';
                         document.getElementById('logoutBtn').disabled = true;
                     }
                })
                .catch(error => {
                    console.error('Error:', error);
                    document.getElementById('status').textContent = '❌ Error checking status';
                });
        }
        
        function logout() {
            if (confirm('Are you sure you want to logout? This will disconnect WhatsApp and require a new QR code scan.')) {
                document.getElementById('logoutBtn').disabled = true;
                document.getElementById('logoutBtn').textContent = '🔄 Logging out...';
                
                fetch('/logout', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    }
                })
                .then(response => response.json())
                .then(data => {
                    if (data.status === 'success') {
                        alert('Logout successful! New QR code will be generated.');
                        // Refresh status to show new QR code
                        setTimeout(checkStatus, 2000);
                    } else {
                        alert('Logout failed: ' + data.message);
                    }
                })
                .catch(error => {
                    console.error('Logout error:', error);
                    alert('Logout failed. Please try again.');
                })
                .finally(() => {
                    document.getElementById('logoutBtn').disabled = false;
                    document.getElementById('logoutBtn').textContent = '🚪 Logout';
                });
            }
        }
        
        // Check status immediately and every 5 seconds
        checkStatus();
        setInterval(checkStatus, 5000);
    </script>
</body>
</html>
    `;
    
    res.send(html);
});


// --- Inisialisasi Server ---
async function startServer() {
    try {
        // 1. Hubungkan ke Database
        const dbService = DatabaseService.getInstance();
        const dbConnected = await dbService.connect();
        if (!dbConnected) {
            console.error('❌ Gagal terhubung ke database. Server tidak akan dimulai.');
            process.exit(1);
        }
        console.log('✅ Database berhasil terhubung');

        // 2. Inisialisasi Browser untuk Web Scraping
        console.log('-> Menginisialisasi browser...');
        await initializeBrowser();
        console.log('✅ Browser berhasil diinisialisasi');

        // 3. Inisialisasi MinIO Service
        console.log('-> Menginisialisasi MinIO service...');
        await minioService.initialize();
        console.log('✅ MinIO service berhasil diinisialisasi');

        // 4. Mulai Bot WhatsApp
        console.log('-> Memulai Bot WhatsApp...');
        await startWhatsAppBot();

        // 5. Setup cleanup schedule
        console.log('-> Setting up temp cleanup schedule...');
        setInterval(cleanupTempDirectories, 60 * 60 * 1000); // Run every hour
        console.log('✅ Temp cleanup scheduled (every hour)');

        // 6. Mulai Server Express
        server = app.listen(PORT, () => {
            console.log(`🚀 Server berjalan di port ${PORT}`);
        });
    } catch (error) {
        console.error('❌ Gagal memulai server:', error);
        process.exit(1);
    }
}

// Jalankan semuanya
startServer();