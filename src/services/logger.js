const EventEmitter = require('events');

class LoggerService extends EventEmitter {
    constructor() {
        super();
        this.logs = [];
        this.maxLogs = 100;
        this.sseClients = new Set();
        this.stats = {
            messagesReceived: 0,
            messagesSent: 0,
            aiResponses: 0,
            startTime: new Date().toISOString()
        };
    }

    log(type, direction, sender, content, extra = {}) {
        const logEntry = {
            id: Date.now().toString() + '-' + Math.random().toString(36).substr(2, 4),
            timestamp: new Date().toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta' }),
            type, // 'chat', 'command', 'autoreply', 'ai', 'system'
            direction, // 'in' or 'out'
            sender,
            content,
            ...extra
        };

        if (direction === 'in') this.stats.messagesReceived++;
        if (direction === 'out') this.stats.messagesSent++;
        if (type === 'ai') this.stats.aiResponses++;

        this.logs.unshift(logEntry);
        if (this.logs.length > this.maxLogs) {
            this.logs.pop();
        }

        this.broadcastSSE({
            event: 'log',
            data: { log: logEntry, stats: this.stats }
        });

        return logEntry;
    }

    addSSEClient(res) {
        this.sseClients.add(res);
        res.on('close', () => {
            this.sseClients.delete(res);
        });
    }

    broadcastSSE(payload) {
        const data = `data: ${JSON.stringify(payload)}\n\n`;
        this.sseClients.forEach(client => {
            try {
                client.write(data);
            } catch (err) {
                this.sseClients.delete(client);
            }
        });
    }

    getLogs() {
        return this.logs;
    }

    getStats() {
        return this.stats;
    }
}

module.exports = new LoggerService();
