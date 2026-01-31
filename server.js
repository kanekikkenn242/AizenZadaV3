const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');

const app = express();
let PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Path to keys database
const KEYS_FILE = path.join(__dirname, 'keys.json');

// Initialize keys file if it doesn't exist
async function initKeysFile() {
    try {
        await fs.access(KEYS_FILE);
    } catch {
        await fs.writeFile(KEYS_FILE, JSON.stringify({ keys: [] }, null, 2));
    }
}

// Read keys from file
async function readKeys() {
    try {
        const data = await fs.readFile(KEYS_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        return { keys: [] };
    }
}

// Write keys to file
async function writeKeys(data) {
    await fs.writeFile(KEYS_FILE, JSON.stringify(data, null, 2));
}

// Generate a random key
function generateKey() {
    const prefix = 'AIZEN';
    const randomPart = crypto.randomBytes(8).toString('hex').toUpperCase();
    return `${prefix}-${randomPart.slice(0, 4)}-${randomPart.slice(4, 8)}-${randomPart.slice(8, 12)}`;
}

// API: Generate new key
app.post('/api/generate-key', async (req, res) => {
    try {
        const { durationDays = 30, adminPassword } = req.body;
        
        // Simple admin password check (në production përdor më të sigurt)
        if (adminPassword !== 'admin123') {
            return res.status(401).json({ error: 'Invalid admin password' });
        }

        const newKey = generateKey();
        const expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + parseInt(durationDays));

        const keysData = await readKeys();
        keysData.keys.push({
            key: newKey,
            createdAt: new Date().toISOString(),
            expiresAt: expiryDate.toISOString(),
            isActive: true,
            lastUsed: null
        });

        await writeKeys(keysData);

        res.json({
            success: true,
            key: newKey,
            expiresAt: expiryDate.toISOString(),
            message: 'Key generated successfully'
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to generate key' });
    }
});

// API: Validate key
app.post('/api/validate-key', async (req, res) => {
    try {
        const { key } = req.body;

        if (!key) {
            return res.status(400).json({ 
                valid: false, 
                error: 'Key is required' 
            });
        }

        const keysData = await readKeys();
        const keyData = keysData.keys.find(k => k.key === key);

        if (!keyData) {
            return res.status(404).json({ 
                valid: false, 
                error: 'Key not found' 
            });
        }

        if (!keyData.isActive) {
            return res.status(403).json({ 
                valid: false, 
                error: 'Key has been deactivated' 
            });
        }

        const now = new Date();
        const expiryDate = new Date(keyData.expiresAt);

        if (expiryDate < now) {
            return res.status(403).json({ 
                valid: false, 
                error: 'Key has expired',
                expired: true
            });
        }

        // Update last used timestamp
        keyData.lastUsed = new Date().toISOString();
        await writeKeys(keysData);

        res.json({
            valid: true,
            expiresAt: keyData.expiresAt,
            message: 'Key is valid'
        });
    } catch (error) {
        res.status(500).json({ 
            valid: false, 
            error: 'Server error' 
        });
    }
});

// API: List all keys (admin only)
app.post('/api/list-keys', async (req, res) => {
    try {
        const { adminPassword } = req.body;

        if (adminPassword !== 'admin123') {
            return res.status(401).json({ error: 'Invalid admin password' });
        }

        const keysData = await readKeys();
        res.json({
            success: true,
            keys: keysData.keys
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to list keys' });
    }
});

// API: Deactivate key (admin only)
app.post('/api/deactivate-key', async (req, res) => {
    try {
        const { key, adminPassword } = req.body;

        if (adminPassword !== 'admin123') {
            return res.status(401).json({ error: 'Invalid admin password' });
        }

        const keysData = await readKeys();
        const keyData = keysData.keys.find(k => k.key === key);

        if (!keyData) {
            return res.status(404).json({ error: 'Key not found' });
        }

        keyData.isActive = false;
        await writeKeys(keysData);

        res.json({
            success: true,
            message: 'Key deactivated successfully'
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to deactivate key' });
    }
});

// Initialize and start server
initKeysFile().then(() => {
    const server = app.listen(PORT, () => {
        console.log(`🚀 AizenZada Server running on http://localhost:${PORT}`);
        console.log(`📝 Keys database: ${KEYS_FILE}`);
        console.log(`👤 User app: http://localhost:${PORT}`);
        console.log(`🔐 Admin panel: http://localhost:${PORT}/admin.html`);
        console.log(`\n⚠️  IMPORTANT: Update API_URL in HTML files if using port ${PORT}`);
    }).on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.log(`❌ Port ${PORT} is busy. Trying port ${PORT + 1}...`);
            PORT += 1;
            initKeysFile().then(() => {
                app.listen(PORT, () => {
                    console.log(`🚀 AizenZada Server running on http://localhost:${PORT}`);
                    console.log(`📝 Keys database: ${KEYS_FILE}`);
                    console.log(`👤 User app: http://localhost:${PORT}`);
                    console.log(`🔐 Admin panel: http://localhost:${PORT}/admin.html`);
                    console.log(`\n⚠️  IMPORTANT: Update API_URL in both HTML files to: http://localhost:${PORT}/api`);
                });
            });
        } else {
            console.error('Server error:', err);
        }
    });
});
