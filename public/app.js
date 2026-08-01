// Global State & Event Source
let eventSource = null;
let currentGroups = [];

document.addEventListener('DOMContentLoaded', () => {
    initTabs();
    initSSE();
    loadGroups();
    loadReminders();
    loadAutoReplies();
    loadAIConfig();
    bindFormEvents();
});

// 1. Tab Navigation
function initTabs() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));

            btn.classList.add('active');
            const targetId = btn.getAttribute('data-tab');
            document.getElementById(targetId).classList.add('active');
        });
    });
}

// 2. Realtime SSE Connection
function initSSE() {
    eventSource = new EventSource('/api/stream');

    eventSource.onmessage = (event) => {
        try {
            const payload = JSON.parse(event.data);
            if (payload.event === 'init') {
                updateStatus(payload.data.status);
                updateStats(payload.data.stats);
                renderLogs(payload.data.logs);
                if (payload.data.aiConfig) fillAIConfig(payload.data.aiConfig);
            } else if (payload.event === 'status') {
                updateStatus(payload.data);
            } else if (payload.event === 'log') {
                prependLog(payload.data.log);
                if (payload.data.stats) updateStats(payload.data.stats);
            }
        } catch (err) {
            console.error('Failed to parse SSE event:', err);
        }
    };

    eventSource.onerror = (err) => {
        console.warn('SSE Disconnected. Retrying...', err);
    };
}

// 3. UI Update Helpers
function updateStatus(status) {
    const badge = document.getElementById('statusBadge');
    const connectedView = document.getElementById('connectedView');
    const qrBox = document.getElementById('qrBox');
    const qrImg = document.getElementById('qrImg');

    if (status.isConnected) {
        badge.textContent = '🟢 Online & Terhubung';
        badge.className = 'status-badge online';
        connectedView.style.display = 'block';
        qrBox.style.display = 'none';
    } else if (status.currentQrDataUrl) {
        badge.textContent = '🟡 Memerlukan Scan QR';
        badge.className = 'status-badge checking';
        connectedView.style.display = 'none';
        qrBox.style.display = 'block';
        qrImg.src = status.currentQrDataUrl;
    } else {
        badge.textContent = '🔴 Offline / Menghubungkan';
        badge.className = 'status-badge offline';
        connectedView.style.display = 'none';
        qrBox.style.display = 'none';
    }
}

function updateStats(stats) {
    if (!stats) return;
    document.getElementById('statReceived').textContent = stats.messagesReceived || 0;
    document.getElementById('statSent').textContent = stats.messagesSent || 0;
    document.getElementById('statAI').textContent = stats.aiResponses || 0;
}

// 4. Activity Logs Renderer
function renderLogs(logs) {
    const container = document.getElementById('logsList');
    if (!logs || logs.length === 0) {
        container.innerHTML = '<div class="empty-state">Belum ada riwayat aktivitas pesan.</div>';
        return;
    }
    container.innerHTML = logs.map(createLogItemHTML).join('');
}

function prependLog(log) {
    const container = document.getElementById('logsList');
    const emptyState = container.querySelector('.empty-state');
    if (emptyState) container.innerHTML = '';
    
    const div = document.createElement('div');
    div.innerHTML = createLogItemHTML(log);
    container.insertBefore(div.firstChild, container.firstChild);
}

function createLogItemHTML(log) {
    const directionIcon = log.direction === 'in' ? '📥' : '📤';
    return `
        <div class="log-item">
            <div class="log-header">
                <span class="log-sender">${directionIcon} ${escapeHtml(log.sender)}</span>
                <div>
                    <span class="log-tag tag-${log.type}">${log.type}</span>
                    <span class="log-time">${log.timestamp}</span>
                </div>
            </div>
            <div class="log-body">${escapeHtml(log.content)}</div>
        </div>
    `;
}

// 5. Fetch & Load Groups
async function loadGroups() {
    try {
        const res = await fetch('/api/groups');
        const groups = await res.json();
        currentGroups = groups;
        document.getElementById('statGroups').textContent = groups.length;

        const groupSelects = [
            document.getElementById('groupSelect'),
            document.getElementById('reminderGroupSelect')
        ];

        groupSelects.forEach(select => {
            if (!select) return;
            if (groups.length === 0) {
                select.innerHTML = '<option value="">Tidak ada grup ditemukan</option>';
            } else {
                select.innerHTML = groups.map(g => 
                    `<option value="${g.id}">${escapeHtml(g.subject)} (${g.size} anggota)</option>`
                ).join('');
            }
        });
    } catch (err) {
        console.error('Failed to load groups:', err);
    }
}

// 6. Direct Message Sender Logic
function toggleRecipientInput() {
    const type = document.getElementById('sendRecipientType').value;
    const groupBox = document.getElementById('groupSelectBox');
    const directBox = document.getElementById('directJidBox');

    if (type === 'group') {
        groupBox.style.display = 'block';
        directBox.style.display = 'none';
    } else {
        groupBox.style.display = 'none';
        directBox.style.display = 'block';
    }
}

// 7. Reminders Scheduling & Management
async function loadReminders() {
    try {
        const res = await fetch('/api/reminders');
        const reminders = await res.json();
        const container = document.getElementById('remindersList');

        if (reminders.length === 0) {
            container.innerHTML = '<p class="text-muted">Belum ada pengingat terjadwal.</p>';
            return;
        }

        container.innerHTML = reminders.map(r => `
            <div class="list-card">
                <div class="list-card-info">
                    <h4>${escapeHtml(r.groupName)}</h4>
                    <p>📅 ${r.scheduledTime}</p>
                    <p class="mt-10">💬 "${escapeHtml(r.message)}"</p>
                </div>
                <button class="btn-danger" onclick="deleteReminder('${r.id}')">Batal</button>
            </div>
        `).join('');
    } catch (err) {
        console.error('Failed to load reminders:', err);
    }
}

function toggleReminderTimeType() {
    const type = document.getElementById('reminderTimeType').value;
    const delayBox = document.getElementById('reminderDelayBox');
    const datetimeBox = document.getElementById('reminderDatetimeBox');

    if (type === 'delay') {
        delayBox.style.display = 'block';
        datetimeBox.style.display = 'none';
    } else {
        delayBox.style.display = 'none';
        datetimeBox.style.display = 'block';
    }
}

async function deleteReminder(id) {
    if (!confirm('Apakah Anda yakin ingin membatalkan pengingat ini?')) return;
    try {
        const res = await fetch(`/api/reminders/${id}`, { method: 'DELETE' });
        const data = await res.json();
        if (data.success) {
            showToast('Pengingat berhasil dibatalkan');
            loadReminders();
        } else {
            showToast(data.error || 'Gagal membatalkan pengingat');
        }
    } catch (err) {
        showToast('Error: ' + err.message);
    }
}

// 8. Auto-Reply Management
async function loadAutoReplies() {
    try {
        const res = await fetch('/api/autoreplies');
        const replies = await res.json();
        const container = document.getElementById('autoReplyList');

        if (replies.length === 0) {
            container.innerHTML = '<p class="text-muted">Belum ada auto-reply kustom.</p>';
            return;
        }

        container.innerHTML = replies.map(item => `
            <div class="list-card">
                <div class="list-card-info">
                    <h4>🔑 "${escapeHtml(item.keyword)}" <span class="badge-ai">${item.matchType}</span></h4>
                    <p class="mt-10">💬 "${escapeHtml(item.response)}"</p>
                </div>
                <button class="btn-danger" onclick="deleteAutoReply('${item.id}')">Hapus</button>
            </div>
        `).join('');
    } catch (err) {
        console.error('Failed to load auto-replies:', err);
    }
}

async function deleteAutoReply(id) {
    if (!confirm('Hapus rule auto-reply ini?')) return;
    try {
        const res = await fetch(`/api/autoreplies/${id}`, { method: 'DELETE' });
        const data = await res.json();
        if (data.success) {
            showToast('Auto-reply berhasil dihapus');
            loadAutoReplies();
        } else {
            showToast(data.error || 'Gagal menghapus auto-reply');
        }
    } catch (err) {
        showToast('Error: ' + err.message);
    }
}

// 9. Groq AI Settings Config
async function loadAIConfig() {
    try {
        const res = await fetch('/api/ai/config');
        const config = await res.json();
        fillAIConfig(config);
    } catch (err) {
        console.error('Failed to load Groq AI config:', err);
    }
}

function fillAIConfig(config) {
    if (!config) return;
    document.getElementById('aiEnabled').checked = Boolean(config.enabled);
    document.getElementById('aiFallbackEnabled').checked = Boolean(config.fallbackEnabled);
    if (config.apiKey) document.getElementById('aiApiKey').value = config.apiKey;
    if (config.model) document.getElementById('aiModel').value = config.model;
    if (config.systemPrompt) document.getElementById('aiSystemPrompt').value = config.systemPrompt;
}

// 10. Form Binding Handlers
function bindFormEvents() {
    // Direct Send
    document.getElementById('directSendForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const type = document.getElementById('sendRecipientType').value;
        const jid = type === 'group' 
            ? document.getElementById('groupSelect').value 
            : document.getElementById('directJidInput').value.trim();
        const message = document.getElementById('directMessageInput').value.trim();

        if (!jid || !message) {
            showToast('Penerima dan pesan wajib diisi!');
            return;
        }

        try {
            const res = await fetch('/api/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jid, message })
            });
            const data = await res.json();
            if (data.success) {
                showToast('🚀 Pesan berhasil dikirim!');
                document.getElementById('directMessageInput').value = '';
            } else {
                showToast('❌ Gagal: ' + data.error);
            }
        } catch (err) {
            showToast('Error: ' + err.message);
        }
    });

    // Schedule Reminder
    document.getElementById('scheduleForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const jid = document.getElementById('reminderGroupSelect').value;
        const message = document.getElementById('reminderMessage').value.trim();
        const timeType = document.getElementById('reminderTimeType').value;
        
        const payload = { jid, message };
        const selectedGroup = currentGroups.find(g => g.id === jid);
        if (selectedGroup) payload.groupName = selectedGroup.subject;

        if (timeType === 'delay') {
            payload.delayMinutes = document.getElementById('reminderDelayMinutes').value;
        } else {
            payload.datetime = document.getElementById('reminderDatetime').value;
        }

        if (!jid || !message) {
            showToast('Target dan isi pengingat wajib diisi!');
            return;
        }

        try {
            const res = await fetch('/api/schedule', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (data.success) {
                showToast('⏰ Reminder berhasil dijadwalkan!');
                document.getElementById('reminderMessage').value = '';
                loadReminders();
            } else {
                showToast('❌ Gagal: ' + data.error);
            }
        } catch (err) {
            showToast('Error: ' + err.message);
        }
    });

    // Add Auto Reply
    document.getElementById('autoReplyForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const keyword = document.getElementById('arKeyword').value.trim();
        const matchType = document.getElementById('arMatchType').value;
        const response = document.getElementById('arResponse').value.trim();

        try {
            const res = await fetch('/api/autoreplies', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ keyword, matchType, response })
            });
            const data = await res.json();
            if (data.success) {
                showToast('⚡ Auto-Reply berhasil disimpan!');
                document.getElementById('arKeyword').value = '';
                document.getElementById('arResponse').value = '';
                loadAutoReplies();
            } else {
                showToast('❌ Gagal: ' + data.error);
            }
        } catch (err) {
            showToast('Error: ' + err.message);
        }
    });

    // Save Groq AI Config
    document.getElementById('aiConfigForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const payload = {
            enabled: document.getElementById('aiEnabled').checked,
            fallbackEnabled: document.getElementById('aiFallbackEnabled').checked,
            apiKey: document.getElementById('aiApiKey').value.trim(),
            model: document.getElementById('aiModel').value,
            systemPrompt: document.getElementById('aiSystemPrompt').value.trim()
        };

        try {
            const res = await fetch('/api/ai/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (data.success) {
                showToast('⚡ Konfigurasi Groq AI berhasil disimpan!');
            } else {
                showToast('❌ Gagal: ' + data.error);
            }
        } catch (err) {
            showToast('Error: ' + err.message);
        }
    });
}

// Helpers
function showToast(msg) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3500);
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
