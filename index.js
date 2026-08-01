const express = require('express');
const path = require('path');
const apiRoutes = require('./src/routes/api');
const whatsapp = require('./src/whatsapp');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static frontend files from public/
app.use(express.static(path.join(__dirname, 'public')));

// API Routes
app.use('/api', apiRoutes);

// Fallback to index.html for SPA routing
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start Express Server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n==================================================`);
    console.log(`🚀 WEB DASHBOARD RUNNING AT: http://localhost:${PORT}`);
    console.log(`🌐 TAILSCALE ACCESS: http://100.118.236.64:${PORT}`);
    console.log(`==================================================\n`);

    // Connect to WhatsApp
    whatsapp.connectToWhatsApp();
});
