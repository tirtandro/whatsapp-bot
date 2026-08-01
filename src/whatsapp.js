const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    DisconnectReason, 
    fetchLatestBaileysVersion 
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const qrcodeTerminal = require('qrcode-terminal');
const QRCode = require('qrcode');

const loggerService = require('./services/logger');
const autoReplyService = require('./services/autoReply');
const reminderService = require('./services/reminder');
const aiService = require('./services/ai');

let sock = null;
let isConnected = false;
let currentQrDataUrl = null;
let groupCache = {};
let userStates = {};

const quotes = [
    "🚀 *Kata Motivasi:* Kesuksesan tidak datang dari apa yang Anda lakukan sesekali, tetapi dari apa yang Anda lakukan secara konsisten.",
    "💡 *Kata Motivasi:* Peluang tidak terjadi begitu saja, Anda yang meciptakannya.",
    "✨ *Kata Motivasi:* Cara terbaik untuk memprediksi masa depan adalah dengan menciptakannya.",
    "🌟 *Kata Motivasi:* Jangan menunggu kesempatan, ciptakan kesempatan itu!",
    "🎯 *Kata Motivasi:* Fokus pada proses, hasil terbaik akan menyusul."
];

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        auth: state,
        browser: ['Tailscale WhatsApp Bot', 'Chrome', '1.0.0']
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            console.log('\n==================================================');
            console.log('SCAN QR CODE DI BAWAH INI DENGAN WHATSAPP ANDA:');
            console.log('==================================================\n');
            qrcodeTerminal.generate(qr, { small: true });
            
            try {
                currentQrDataUrl = await QRCode.toDataURL(qr);
            } catch (err) {
                console.error('Failed to generate QR DataURL:', err);
            }
            loggerService.broadcastSSE({ event: 'status', data: getStatus() });
        }

        if (connection === 'close') {
            isConnected = false;
            currentQrDataUrl = null;
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const shouldReconnect = (statusCode !== DisconnectReason.loggedOut);
            console.log(`[WA] Connection closed (code: ${statusCode}). Reconnecting: ${shouldReconnect}`);
            loggerService.log('system', 'out', 'System', `Koneksi terputus (code: ${statusCode})`);
            loggerService.broadcastSSE({ event: 'status', data: getStatus() });

            if (shouldReconnect) {
                setTimeout(connectToWhatsApp, 3000);
            }
        } else if (connection === 'open') {
            isConnected = true;
            currentQrDataUrl = null;
            console.log('\n==================================================');
            console.log('✅ BERHASIL TERHUBUNG KE WHATSAPP!');
            console.log('==================================================\n');
            loggerService.log('system', 'out', 'System', 'Berhasil terhubung ke WhatsApp');
            loggerService.broadcastSSE({ event: 'status', data: getStatus() });
            fetchGroups();
        }
    });

    sock.ev.on('messages.upsert', async (m) => {
        if (m.type !== 'notify') return;
        for (const msg of m.messages) {
            if (!msg.message || msg.key.fromMe) continue;
            
            const from = msg.key.remoteJid;
            const isGroup = from.endsWith('@g.us');
            const senderName = msg.pushName || from;
            const messageContent = msg.message.conversation || 
                                   msg.message.extendedTextMessage?.text || '';
            
            const text = messageContent.trim();
            const lowerText = text.toLowerCase();
            if (!text) continue;

            // Log incoming chat
            loggerService.log('chat', 'in', senderName, text, { jid: from, isGroup });

            // 1. Groq AI Command (!ai <prompt> or !groq <prompt>)
            if (lowerText.startsWith('!ai ') || lowerText.startsWith('!groq ')) {
                const prompt = text.substring(text.indexOf(' ') + 1).trim();
                if (!prompt) {
                    await sendReply(from, '🤖 Ketik `!ai <pertanyaan>` untuk bertanya ke Androbot AI.\n\n_Contoh:_ `!ai Buatkan puisi tentang kopi`', msg);
                    continue;
                }

                try {
                    await sendReply(from, '🤖 *Androbot AI sedang berpikir...*', msg);
                    const aiReply = await aiService.generateResponse(prompt);
                    await sendReply(from, `🤖 *Androbot AI:*\n\n${aiReply}`, msg, 'ai');
                } catch (err) {
                    await sendReply(from, `❌ *Androbot AI Error:* ${err.message}`, msg, 'system');
                }
                continue;
            }

            // 2. Interactive Menu
            if (lowerText === '!menu' || lowerText === 'menu') {
                userStates[from] = 'WAITING_MENU_CHOICE';
                const menuText = `🤖 *MENU UTAMA BOT INTERAKTIF*\n\n` +
                    `Silakan ketik *angka (1-5)* atau perintah langsung:\n\n` +
                    `1️⃣ *!waktu* : Cek Waktu & Tanggal Server\n` +
                    `2️⃣ *!jadwal* : Daftar Reminder Aktif\n` +
                    `3️⃣ *!quote* : Kata Motivasi Hari Ini\n` +
                    `4️⃣ *!info* : Informasi Server Bot\n` +
                    `5️⃣ *!listgroups* : Daftar ID Grup WhatsApp\n\n` +
                    `💡 *Tips:* Ketik *!ai <pertanyaan>* untuk Groq AI, atau perintah \`!help\`.`;
                await sendReply(from, menuText, msg, 'command');
                continue;
            }

            // Menu response handling
            if (userStates[from] === 'WAITING_MENU_CHOICE' && ['1', '2', '3', '4', '5'].includes(lowerText)) {
                delete userStates[from];
                if (lowerText === '1') {
                    const nowStr = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
                    await sendReply(from, `⏰ *Waktu Server Saat Ini:*\n${nowStr} WIB`, msg, 'command');
                    continue;
                } else if (lowerText === '2') {
                    await handleJadwalCommand(from, msg);
                    continue;
                } else if (lowerText === '3') {
                    const randomQuote = quotes[Math.floor(Math.random() * quotes.length)];
                    await sendReply(from, randomQuote, msg, 'command');
                    continue;
                } else if (lowerText === '4') {
                    await sendReply(from, 'ℹ️ Server Bot berjalan di Komputer Rumah via Tailscale (100.118.236.64).', msg, 'command');
                    continue;
                } else if (lowerText === '5') {
                    await handleListGroupsCommand(from, msg, isGroup);
                    continue;
                }
            }

            // 3. Standard Built-in Commands
            if (lowerText === '!ping') {
                await sendReply(from, '🏓 Pong! Bot aktif & terhubung via Tailscale.', msg, 'command');
            } else if (lowerText === '!help') {
                const helpText = `🤖 *WhatsApp Reminder & Assistant Bot*\n\n` +
                    `*Perintah Chat Interaktif:*\n` +
                    `• \`!menu\` : Menu navigasi interaktif\n` +
                    `• \`!ai <pertanyaan>\` : Tanya Jawab Groq AI\n` +
                    `• \`!ping\` : Cek status keaktifan bot\n` +
                    `• \`!waktu\` : Cek jam & tanggal server\n` +
                    `• \`!jadwal\` : Cek daftar pengingat aktif\n` +
                    `• \`!quote\` : Dapatkan kata motivasi\n` +
                    `• \`!listgroups\` : Tampilkan ID grup ini & grup lainnya\n` +
                    `• \`!info\` : Informasi server bot\n\n` +
                    `*Web Dashboard (Tailscale):*\n` +
                    `👉 http://100.118.236.64:3000`;
                await sendReply(from, helpText, msg, 'command');
            } else if (lowerText === '!info') {
                await sendReply(from, 'ℹ️ Server Bot berjalan di Komputer Rumah via Tailscale (100.118.236.64).', msg, 'command');
            } else if (lowerText === '!waktu' || lowerText === '!jam') {
                const nowStr = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
                await sendReply(from, `⏰ *Waktu Server Saat Ini:*\n${nowStr} WIB`, msg, 'command');
            } else if (lowerText === '!quote' || lowerText === '!motivasi') {
                const randomQuote = quotes[Math.floor(Math.random() * quotes.length)];
                await sendReply(from, randomQuote, msg, 'command');
            } else if (lowerText === '!jadwal' || lowerText === '!reminders') {
                await handleJadwalCommand(from, msg);
            } else if (lowerText === '!listgroups') {
                await handleListGroupsCommand(from, msg, isGroup);
            } 
            // 4. Greetings
            else if (['halo', 'hai', 'hi', 'p', 'assalamualaikum', 'selamat pagi', 'selamat siang', 'selamat malam'].includes(lowerText)) {
                let greetingReply = `👋 Halo! Ada yang bisa bot bantu?\n\nKetik *!menu* untuk opsi interaktif atau *!ai <pertanyaan>* untuk Groq AI.`;
                if (lowerText === 'assalamualaikum') {
                    greetingReply = `Waalaikumsalam Wr. Wb. 👋\n\nKetik *!menu* untuk opsi interaktif atau *!ai <pertanyaan>* untuk Groq AI.`;
                }
                await sendReply(from, greetingReply, msg, 'command');
            }
            // 5. Custom Auto-Replies
            else {
                const matched = autoReplyService.findMatch(text);
                if (matched) {
                    await sendReply(from, matched.response, msg, 'autoreply');
                } 
                // 6. Groq AI Auto-Reply Fallback (if enabled and no keyword rule matched)
                else {
                    const aiConfig = aiService.getConfig();
                    if (aiConfig.enabled && aiConfig.fallbackEnabled && aiConfig.apiKey) {
                        try {
                            const aiReply = await aiService.generateResponse(text);
                            await sendReply(from, `🤖 *Androbot AI:*\n\n${aiReply}`, msg, 'ai');
                        } catch (err) {
                            console.error('Groq AI Fallback Error:', err.message);
                        }
                    }
                }
            }
        }
    });
}

async function sendReply(jid, text, quotedMsg = null, logType = 'chat') {
    if (!sock || !isConnected) return;
    try {
        const opts = quotedMsg ? { quoted: quotedMsg } : {};
        await sock.sendMessage(jid, { text }, opts);
        loggerService.log(logType, 'out', 'Bot', text, { jid });
    } catch (err) {
        console.error('Gagal mengirim pesan WhatsApp:', err);
    }
}

async function sendMessageDirect(jid, text) {
    if (!sock || !isConnected) throw new Error('WhatsApp bot belum terhubung');
    let targetJid = jid;
    if (!targetJid.includes('@')) {
        let cleaned = targetJid.replace(/[^0-9]/g, '');
        if (cleaned.startsWith('0')) cleaned = '62' + cleaned.slice(1);
        targetJid = cleaned + '@s.whatsapp.net';
    }
    await sock.sendMessage(targetJid, { text });
    loggerService.log('chat', 'out', 'Bot (Web Direct)', text, { jid: targetJid });
}

async function handleJadwalCommand(from, msg) {
    const list = reminderService.getReminders();
    if (list.length === 0) {
        await sendReply(from, '⏰ *Daftar Reminder:* Belum ada pengingat terjadwal.', msg, 'command');
    } else {
        let text = '⏰ *Daftar Reminder Terjadwal Aktif:*\n\n';
        list.forEach((r, idx) => {
            text += `${idx + 1}. *${r.groupName}*\n📅 Waktu: ${r.scheduledTime}\n💬 Pesan: "${r.message}"\n\n`;
        });
        await sendReply(from, text, msg, 'command');
    }
}

async function handleListGroupsCommand(from, msg, isGroup) {
    if (isGroup) {
        await sendReply(from, `📋 *ID Grup ini:* \`${from}\``, msg, 'command');
    } else {
        const groups = await fetchGroups();
        let groupListStr = '📋 *Daftar Grup WhatsApp Anda:*\n\n';
        Object.values(groups).forEach(g => {
            groupListStr += `• *${g.subject}*\n  ID: \`${g.id}\`\n\n`;
        });
        await sendReply(from, groupListStr, msg, 'command');
    }
}

async function fetchGroups() {
    if (!sock || !isConnected) return {};
    try {
        const groups = await sock.groupFetchAllParticipating();
        groupCache = groups;
        return groups;
    } catch (e) {
        console.error('Gagal mengambil daftar grup:', e);
        return groupCache;
    }
}

function getStatus() {
    return {
        isConnected,
        currentQrDataUrl,
        deviceName: 'desktop-cosccb9',
        tailscaleIp: '100.118.236.64'
    };
}

module.exports = {
    connectToWhatsApp,
    getStatus,
    fetchGroups,
    sendMessageDirect,
    sendReply
};
