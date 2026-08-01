const express = require('express');
const router = express.Router();

const whatsapp = require('../whatsapp');
const loggerService = require('../services/logger');
const autoReplyService = require('../services/autoReply');
const reminderService = require('../services/reminder');
const aiService = require('../services/ai');

// Status & Devices
router.get('/status', (req, res) => {
    res.json(whatsapp.getStatus());
});

// SSE Realtime Event Stream
router.get('/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    // Initial state payload
    const initPayload = {
        event: 'init',
        data: {
            status: whatsapp.getStatus(),
            stats: loggerService.getStats(),
            logs: loggerService.getLogs(),
            aiConfig: aiService.getConfig()
        }
    };
    res.write(`data: ${JSON.stringify(initPayload)}\n\n`);

    loggerService.addSSEClient(res);
});

// WhatsApp Groups
router.get('/groups', async (req, res) => {
    const groups = await whatsapp.fetchGroups();
    const result = Object.values(groups).map(g => ({
        id: g.id,
        subject: g.subject,
        size: g.participants ? g.participants.length : 0
    }));
    res.json(result);
});

// Direct Message Sending
router.post('/send', async (req, res) => {
    const { jid, message } = req.body;
    if (!jid || !message) {
        return res.status(400).json({ error: 'jid dan message wajib diisi' });
    }
    try {
        await whatsapp.sendMessageDirect(jid, message);
        res.json({ success: true, message: 'Pesan berhasil dikirim' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Schedule Reminders
router.post('/schedule', async (req, res) => {
    const { jid, message, delayMinutes, datetime, groupName } = req.body;
    if (!jid || !message) {
        return res.status(400).json({ error: 'Pilihan grup/kontak dan isi pesan pengingat wajib diisi' });
    }

    let targetTime = null;
    if (delayMinutes !== undefined && delayMinutes !== null && delayMinutes !== '') {
        const mins = parseInt(delayMinutes, 10);
        if (isNaN(mins) || mins <= 0) {
            return res.status(400).json({ error: 'Jumlah menit pengingat harus berupa angka lebih besar dari 0' });
        }
        targetTime = new Date(Date.now() + mins * 60 * 1000);
    } else if (datetime) {
        targetTime = new Date(datetime);
    } else {
        return res.status(400).json({ error: 'Silakan tentukan menit penundaan atau pilih tanggal & jam pengiriman' });
    }

    if (!targetTime || isNaN(targetTime.getTime())) {
        return res.status(400).json({ error: 'Format tanggal & waktu yang dipilih tidak valid' });
    }

    try {
        const reminder = reminderService.addReminder({
            jid,
            groupName,
            message,
            targetTime,
            sendCallback: async (targetJid, text) => {
                await whatsapp.sendMessageDirect(targetJid, text);
            }
        });
        res.json({ success: true, reminder });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

router.get('/reminders', (req, res) => {
    res.json(reminderService.getReminders());
});

router.delete('/reminders/:id', (req, res) => {
    const { id } = req.params;
    if (reminderService.removeReminder(id)) {
        return res.json({ success: true, message: 'Pengingat berhasil dibatalkan' });
    }
    res.status(404).json({ error: 'Pengingat tidak ditemukan' });
});

// Custom Auto-Replies
router.get('/autoreplies', (req, res) => {
    res.json(autoReplyService.loadReplies());
});

router.post('/autoreplies', (req, res) => {
    const { keyword, matchType, response } = req.body;
    if (!keyword || !response) {
        return res.status(400).json({ error: 'Kata kunci dan pesan balasan wajib diisi' });
    }

    try {
        const item = autoReplyService.addReply({ keyword, matchType, response });
        res.json({ success: true, item });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.delete('/autoreplies/:id', (req, res) => {
    const { id } = req.params;
    if (autoReplyService.deleteReply(id)) {
        return res.json({ success: true, message: 'Auto-reply berhasil dihapus' });
    }
    res.status(404).json({ error: 'Auto-reply tidak ditemukan' });
});

// Groq AI Configuration
router.get('/ai/config', (req, res) => {
    res.json(aiService.getConfig());
});

router.post('/ai/config', (req, res) => {
    const { enabled, apiKey, model, systemPrompt, fallbackEnabled } = req.body;
    const updated = aiService.saveConfig({
        enabled: Boolean(enabled),
        apiKey: apiKey !== undefined ? apiKey.trim() : aiService.getConfig().apiKey,
        model: model || 'llama-3.3-70b-versatile',
        systemPrompt: systemPrompt || aiService.getConfig().systemPrompt,
        fallbackEnabled: Boolean(fallbackEnabled)
    });

    if (updated) {
        res.json({ success: true, config: aiService.getConfig() });
    } else {
        res.status(500).json({ error: 'Gagal menyimpan konfigurasi Groq AI' });
    }
});

// Logs & Stats API
router.get('/logs', (req, res) => {
    res.json({
        logs: loggerService.getLogs(),
        stats: loggerService.getStats()
    });
});

module.exports = router;
