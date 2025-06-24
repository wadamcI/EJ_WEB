const express = require('express');
const { OpenAI } = require('openai');
require('dotenv').config();
const { Pool } = require('pg');


const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'mytest',
    password: 'mysecretpassword',
    port: 5432,
});

const router = express.Router();

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// Use a simplified context — modify to load actual outage data
async function getOutageSummaryFromDB(start = '2019-06-01', end = '2019-06-12') {
    const summarySql = `
        SELECT
            COUNT(*) AS total_outages,
            SUM(estcustaffected)::int AS total_customers,
            COUNT(DISTINCT zip_code) AS affected_zip_codes,
            STRING_AGG(DISTINCT cause, ', ') AS causes,
            ROUND(AVG(temperature_2m)::numeric, 2) AS avg_temp,
            ROUND(MAX(wind_gusts_10m)::numeric, 2) AS max_wind_gust,
            ROUND(SUM(precipitation)::numeric, 2) AS total_precipitation,
            ROUND(SUM(snowfall)::numeric, 2) AS total_snowfall,
            ROUND(AVG(median_household_income)::numeric) AS avg_income,
            ROUND(AVG(total_population)::numeric) AS avg_population,
            ROUND(AVG(median_age)::numeric, 1) AS avg_median_age,
            ROUND(AVG(no_internet_access)::numeric) AS avg_no_internet_access,
            ROUND(AVG(income_below_poverty)::numeric) AS avg_poverty_count
        FROM outages_geojson
        WHERE datetime BETWEEN $1 AND $2;
    `;

    const breakdownSql = `
        SELECT 
            zip_code,
            po_name AS city,
            COUNT(*) AS outages,
            SUM(estcustaffected)::int AS customers
        FROM outages_geojson
        WHERE datetime BETWEEN $1 AND $2
        GROUP BY zip_code, po_name
        ORDER BY customers DESC
        LIMIT 5;
    `;

    try {
        const summaryResult = await pool.query(summarySql, [start, end]);
        const breakdownResult = await pool.query(breakdownSql, [start, end]);

        const s = summaryResult.rows[0];
        const b = breakdownResult.rows;

        const breakdownText = b.map(row =>
            `- ${row.city} (${row.zip_code}): ${row.outages} outages, ${row.customers} customers affected`
        ).join('\n');

        return `
📊 Outage Summary (${start} to ${end}):
- Total Outages: ${s.total_outages}
- Customers Affected: ${s.total_customers}
- Affected ZIP Codes: ${s.affected_zip_codes}
- Causes: ${s.causes}

🌦️ Weather Overview:
- Avg Temperature: ${s.avg_temp}°F
- Max Wind Gust: ${s.max_wind_gust} m/s
- Total Precipitation: ${s.total_precipitation} mm
- Total Snowfall: ${s.total_snowfall} cm

🏘️ Socioeconomic Overview:
- Avg Household Income: $${s.avg_income}
- Avg Population: ${s.avg_population}
- Avg Median Age: ${s.avg_median_age}
- Avg No Internet Access: ${s.avg_no_internet_access}
- Avg Individuals Below Poverty: ${s.avg_poverty_count}

📍 Top 5 Affected Locations:
${breakdownText}
        `.trim();

    } catch (err) {
        console.error("❌ Error fetching outage summary:", err);
        return "⚠️ Failed to retrieve outage data from the database.";
    }
}


router.post('/api/chat', async (req, res) => {
    const { message } = req.body;

    // Default: You can later parse the message for dynamic date ranges
    const outageContext = await getOutageSummaryFromDB("2019-06-01", "2019-06-12");

    const prompt = `
You are a data assistant helping users interpret power outage data.

The following is a report summary generated from outages in a specific region and time window:

${outageContext}

Now, answer this user question based on the data:
"${message}"
`;

    try {
        const completion = await openai.chat.completions.create({
            model: "o3-mini",
            messages: [
                { role: "system", content: "You help interpret power outage and community data." },
                { role: "user", content: prompt }
            ],
        });

        res.json({ reply: completion.choices[0].message.content });
    } catch (err) {
        console.error("OpenAI Error:", err);
        res.status(500).json({ error: "Chat failed" });
    }
});

module.exports = router;
