const fs = require('fs');
const path = require('path');

const AI_CONFIG_FILE = path.join(__dirname, '../../ai_config.json');

const VALID_GROQ_MODELS = [
    'llama-3.3-70b-versatile',
    'llama-3.1-8b-instant',
    'mixtral-8x7b-32768',
    'gemma2-9b-it'
];

class AIService {
    constructor() {
        this.config = this.loadConfig();
    }

    loadConfig() {
        const defaultConfig = {
            enabled: false,
            apiKey: '',
            model: 'llama-3.3-70b-versatile',
            systemPrompt: 'Kamu adalah asisten AI yang ramah, responsif, dan cerdas di WhatsApp. Berikan jawaban yang singkat, padat, dan berguna.',
            fallbackEnabled: true
        };

        try {
            if (fs.existsSync(AI_CONFIG_FILE)) {
                const data = fs.readFileSync(AI_CONFIG_FILE, 'utf8');
                const parsed = JSON.parse(data);
                const merged = { ...defaultConfig, ...parsed };

                // Sanitize legacy / invalid Grok models to valid Groq model
                if (!VALID_GROQ_MODELS.includes(merged.model) || merged.model.startsWith('grok-')) {
                    merged.model = 'llama-3.3-70b-versatile';
                }

                return merged;
            }
        } catch (err) {
            console.error('Gagal membaca ai_config.json:', err);
        }
        return defaultConfig;
    }

    saveConfig(newConfig) {
        try {
            this.config = { ...this.config, ...newConfig };

            // Sanitize model choice before saving
            if (!VALID_GROQ_MODELS.includes(this.config.model) || this.config.model.startsWith('grok-')) {
                this.config.model = 'llama-3.3-70b-versatile';
            }

            fs.writeFileSync(AI_CONFIG_FILE, JSON.stringify(this.config, null, 2), 'utf8');
            return true;
        } catch (err) {
            console.error('Gagal menyimpan ai_config.json:', err);
            return false;
        }
    }

    getConfig() {
        return this.config;
    }

    async generateResponse(userPrompt) {
        if (!this.config.apiKey) {
            throw new Error('Groq API Key belum dikonfigurasi di Web Dashboard.');
        }

        let targetModel = this.config.model || 'llama-3.3-70b-versatile';
        if (!VALID_GROQ_MODELS.includes(targetModel) || targetModel.startsWith('grok-')) {
            targetModel = 'llama-3.3-70b-versatile';
        }

        const endpoint = 'https://api.groq.com/openai/v1/chat/completions';
        const payload = {
            model: targetModel,
            messages: [
                { role: 'system', content: this.config.systemPrompt },
                { role: 'user', content: userPrompt }
            ],
            temperature: 0.7,
            max_tokens: 800
        };

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.config.apiKey.trim()}`
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Groq API Error (${response.status}): ${errText}`);
        }

        const data = await response.json();
        if (data.choices && data.choices.length > 0 && data.choices[0].message) {
            return data.choices[0].message.content.trim();
        }

        throw new Error('Respons dari Groq API tidak sesuai format.');
    }
}

module.exports = new AIService();
