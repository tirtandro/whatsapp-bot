const fs = require('fs');
const path = require('path');

const CUSTOM_REPLIES_FILE = path.join(__dirname, '../../custom_replies.json');

class AutoReplyService {
    loadReplies() {
        try {
            if (fs.existsSync(CUSTOM_REPLIES_FILE)) {
                const data = fs.readFileSync(CUSTOM_REPLIES_FILE, 'utf8');
                return JSON.parse(data);
            }
        } catch (err) {
            console.error('Gagal membaca custom_replies.json:', err);
        }
        return [];
    }

    saveReplies(data) {
        try {
            fs.writeFileSync(CUSTOM_REPLIES_FILE, JSON.stringify(data, null, 2), 'utf8');
            return true;
        } catch (err) {
            console.error('Gagal menyimpan custom_replies.json:', err);
            return false;
        }
    }

    findMatch(text) {
        const replies = this.loadReplies();
        const lowerText = text.toLowerCase().trim();

        return replies.find(item => {
            const kw = item.keyword.toLowerCase();
            if (item.matchType === 'exact') {
                return lowerText === kw;
            } else {
                return lowerText.includes(kw);
            }
        });
    }

    addReply({ keyword, matchType, response }) {
        const current = this.loadReplies();
        const newItem = {
            id: Date.now().toString(),
            keyword: keyword.trim(),
            matchType: matchType || 'contains',
            response: response.trim()
        };
        current.push(newItem);
        if (this.saveReplies(current)) {
            return newItem;
        }
        throw new Error('Gagal menyimpan auto-reply');
    }

    deleteReply(id) {
        let current = this.loadReplies();
        const initialLen = current.length;
        current = current.filter(item => item.id !== id);

        if (current.length === initialLen) {
            return false;
        }
        return this.saveReplies(current);
    }
}

module.exports = new AutoReplyService();
