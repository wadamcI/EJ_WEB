// index.js
const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files (HTML, CSS, JS, images) from current folder
app.use(express.static(path.join(__dirname))); // serves all static files including "pages/"

// Simple JSON for testing
const mockOutages = [
    { lat: 42.2808, lng: -83.7430, description: 'Ann Arbor outage' },
    { lat: 42.3314, lng: -83.0458, description: 'Detroit outage' },
    { lat: 42.7325, lng: -84.5555, description: 'Lansing outage' }
];

// API route
app.get('/api/outages', (req, res) => {
    res.json(mockOutages);
});

// Serve index.html at "/"
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
});

