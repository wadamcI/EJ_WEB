const express = require('express');
const { OpenAI } = require('openai');
require('dotenv').config();
const { Pool } = require('pg');
const fetch = require('node-fetch');



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

const chatHistories = new Map();



// ===============================
// In‑depth Outage Summary Query
// ===============================
async function getInDepthOutageSummaryForZip(zip) {
    const sql = `
        SELECT
            COUNT(*) AS total_outages,
            SUM(estcustaffected)::int AS total_customers,
            STRING_AGG(DISTINCT cause, ', ') AS causes,

            ROUND(AVG(temperature_2m)::numeric, 2) AS avg_temp,
            ROUND(AVG(relative_humidity_2m)::numeric, 1) AS avg_humidity,
            ROUND(SUM(precipitation)::numeric, 2) AS total_precip,
            ROUND(SUM(snowfall)::numeric, 2) AS total_snowfall,
            ROUND(AVG(wind_speed_10m)::numeric, 1) AS avg_wind_speed,
            ROUND(MAX(wind_gusts_10m)::numeric, 1) AS max_wind_gust,

            ROUND(AVG(median_household_income)::numeric) AS avg_income,
            ROUND(AVG(median_age)::numeric, 1) AS avg_age,
            ROUND(AVG(total_population)::numeric) AS avg_population,
            ROUND(AVG(no_internet_access)::numeric) AS avg_no_internet,
            ROUND(AVG(income_below_poverty)::numeric) AS avg_poverty,
            ROUND(AVG(civilian_unemployed)::numeric, 1) AS avg_unemployment,
            ROUND(AVG(worked_from_home)::numeric, 1) AS avg_work_from_home
        FROM outages_geojson
        WHERE zip_code = $1
    `;

    try {
        const result = await pool.query(sql, [zip]);
        const s = result.rows[0];

        return `
📊 Outage Summary for ZIP ${zip}:
- Total Outages: ${s.total_outages}
- Customers Affected: ${s.total_customers}
- Causes: ${s.causes}

🌦️ Weather Overview:
- Avg Temperature: ${s.avg_temp}°F
- Avg Humidity: ${s.avg_humidity}%
- Total Precipitation: ${s.total_precip} mm
- Total Snowfall: ${s.total_snowfall} cm
- Avg Wind Speed: ${s.avg_wind_speed} m/s
- Max Wind Gust: ${s.max_wind_gust} m/s

🏘️ Socioeconomic Overview:
- Avg Household Income: $${s.avg_income}
- Avg Median Age: ${s.avg_age}
- Avg Population: ${s.avg_population}
- Avg No Internet Access: ${s.avg_no_internet} people
- Avg Individuals Below Poverty: ${s.avg_poverty}
- Avg Unemployment Rate: ${s.avg_unemployment}%
- Avg Working from Home: ${s.avg_work_from_home}%
        `.trim();

    } catch (err) {
        console.error("❌ Error fetching in‑depth outage summary:", err);
        return `⚠️ Failed to retrieve in‑depth outage data for ZIP ${zip}.`;
    }
}

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

// ===============================
// POST /chat
// ===============================
router.post('/chat', async (req, res) => {
    const { message } = req.body;
    const sessionId = req.ip;

    if (!chatHistories.has(sessionId)) {
        chatHistories.set(sessionId, [
            {
                role: "system",
                content: `
You help users understand power outage and community data. 
If the user provides a ZIP code or address, respond: "Fetching outage data for ZIP X" and wait for outage context.
Otherwise, answer based on prior context.
                `.trim()
            }
        ]);
    }

    const history = chatHistories.get(sessionId);
    history.push({ role: "user", content: message });

    try {
        const completion = await openai.chat.completions.create({
            model: "o3-mini",
            messages: history,
        });

        let reply = completion.choices[0].message.content.trim();
        console.log(`🤖 AI reply: ${reply}`);

        history.push({ role: "assistant", content: reply });

        const zipMatch = reply.match(/Fetching outage data for ZIP (\d{5})/);

        if (zipMatch) {
            const zip = zipMatch[1];
            console.log(`📍 Detected ZIP: ${zip}`);

            const outageContext = await getInDepthOutageSummaryForZip(zip);

            history.push({ role: "assistant", content: outageContext });

            reply += `\n\n${outageContext}`;

            // extract metrics for the chart
            const metrics = {
                outage_count: parseInt(outageContext.match(/Total Outages: (\d+)/)?.[1] || 0),
                avg_income: parseInt(outageContext.match(/Avg Household Income: \$([0-9,]+)/)?.[1].replace(/,/g, '') || 0),
                avg_age: parseFloat(outageContext.match(/Avg Median Age: ([0-9.]+)/)?.[1] || 0),
                customers_affected: parseInt(outageContext.match(/Customers Affected: (\d+)/)?.[1] || 0)
            };

            res.json({
                reply,
                metrics,
                visualization: "bar_chart"
            });
        } else {
            res.json({ reply });
        }

    } catch (err) {
        console.error("OpenAI Error:", err);
        res.status(500).json({ error: "Chat failed" });
    }
});


module.exports = router;
