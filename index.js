const express = require('express');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// PostgreSQL connection (edit these values!)
const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'mytest',
    password: 'mysecretpassword',
    port: 5432,
});

// Serve static files (HTML, CSS, JS, etc.)
app.use(express.static(path.join(__dirname)));
app.use(express.static(path.join(__dirname, 'pages')));
app.use('/js', express.static(path.join(__dirname, 'js')));
app.use('/styles', express.static(path.join(__dirname, 'styles.css')));



// GeoJSON API for outage data
app.get('/api/outages', async (req, res) => {
    const { start = '1900-01-01', end = '2100-01-01', cause } = req.query;

    const sql = `
        SELECT jsonb_build_object(
                       'type', 'FeatureCollection',
                       'features', jsonb_agg(
                               jsonb_build_object(
                                       'type', 'Feature',
                                       'geometry', ST_AsGeoJSON(ST_GeomFromWKB(wkb_geometry)::geometry)::jsonb,
                                       'properties', to_jsonb(o) - 'wkb_geometry'
                               )
                                   )
               ) AS geojson
        FROM outages_geojson o
        WHERE datetime BETWEEN $1 AND $2
          AND wkb_geometry IS NOT NULL
            ${cause ? "AND cause ILIKE $3" : ""}
    `;

    const values = [start, end];
    if (cause) values.push(`%${cause}%`);

    try {
        const result = await pool.query(sql, values);
        res.json(result.rows[0].geojson || { type: 'FeatureCollection', features: [] });
    } catch (err) {
        console.error('DB query error:', err);
        res.status(500).send('Internal Server Error');
    }
});

const chatRoute = require('./js/chat');
app.use(chatRoute); // This will make /api/chat work

// Serve index.html at root
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
});
