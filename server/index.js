const express = require('express');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();


const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// PostgreSQL connection (edit these values!)
const pool = new Pool({
    user: process.env.PGUSER || 'postgres',
    host: process.env.PGHOST || 'localhost',
    database: process.env.PGDATABASE || 'mytest',
    password: process.env.PGPASSWORD || 'mysecretpassword',
    port: process.env.PGPORT || 5432,
});

// Serve everything in /public as root
app.use(express.static(path.join(__dirname, '../public')));

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
            ${cause ? "AND cause I LIKE $3" : ""}
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

// Date range API

app.get('/api/dates', async (req, res) => {
    const sql = `
        SELECT 
            MIN(datetime) AS min_date,
            MAX(datetime) AS max_date
        FROM outages_geojson
    `;

    try {
        const result = await pool.query(sql);
        const row = result.rows[0];

        const minDateISO = new Date(row.min_date).toISOString().split('T')[0];
        const maxDateISO = new Date(row.max_date).toISOString().split('T')[0];

        console.log(`📅 DB date range: ${minDateISO} → ${maxDateISO}`);

        res.json({
            minDate: minDateISO,
            maxDate: maxDateISO
        });

    } catch (err) {
        console.error("❌ Failed to get date range:", err);
        res.status(500).json({ error: "Failed to get date range" });
    }
});


// // Chat API Route
const chatRoute = require('./controllers/chat');
app.use('/api', chatRoute);

// Serve index.html at root
app.get((req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});


app.use((req, res) => {
    res.status(404).sendFile(path.join(__dirname, '../public/404.html'));
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
});
