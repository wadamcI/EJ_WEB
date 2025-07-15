const express = require('express');
const { OpenAI } = require('openai');
require('dotenv').config();
const { Pool } = require('pg');

const router = express.Router();

const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'mytest',
    password: 'mysecretpassword',
    port: 5432,
});


const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});


const chatHistories = new Map();
const sessionStates = new Map();



// In‑depth Outage Summary Query
async function getComparisonSummary(zips) {
    const sql = `
        SELECT
            zip_code,
            date_trunc('month', outagestarttime) AS month,
            COUNT(*) AS outages
        FROM outages_geojson
        WHERE zip_code = ANY($1)
        GROUP BY zip_code, month
        ORDER BY month, zip_code;
    `;

    try {
        const result = await pool.query(sql, [zips]);
        if (!result.rows.length) {
            return { text: "No data found for the selected ZIP codes." };
        }

        const zipSeries = {};
        result.rows.forEach(row => {
            const month = row.month.toISOString().slice(0,7);
            if (!zipSeries[row.zip_code]) zipSeries[row.zip_code] = {};
            zipSeries[row.zip_code][month] = parseInt(row.outages);
        });

        const labels = [...new Set(result.rows.map(r => r.month.toISOString().slice(0,7)))];
        const datasets = Object.keys(zipSeries).map(zip => ({
            label: `ZIP ${zip}`,
            data: labels.map(month => zipSeries[zip][month] || 0)
        }));

        return {
            text: `📊 Comparison of selected ZIPs over time. Try typing: explore economic correlations `,
            visualization: 'outage_timeseries',
            metrics: { labels, datasets }
        };
    } catch (err) {
        console.error("❌ Error fetching comparison summary:", err);
        return { text: "⚠️ Failed to retrieve comparison data." };
    }
}

async function getCorrelationsSummary(zips) {
    const sql = `
        SELECT
            zip_code,
            ROUND(COALESCE(AVG(NULLIF(median_household_income, -666666666))::numeric, 0), 0) AS median_income,
            ROUND(COALESCE(AVG(NULLIF(income_below_poverty, -666666666))::numeric / 10.0, 0), 1) AS poverty_rate,
            ROUND(COALESCE(AVG(NULLIF(median_age, -666666666))::numeric, 0), 1) AS median_age,
            ROUND(
                    COALESCE(
                            (100.0 * SUM(white_alone)::numeric / NULLIF(SUM(total_population)::numeric,0)),
                            0
                    ), 1
            ) AS white_pct,
            ROUND(
                    COALESCE(
                            (100.0 * SUM(black_alone)::numeric / NULLIF(SUM(total_population)::numeric,0)),
                            0
                    ), 1
            ) AS black_pct,
            ROUND(
                    COALESCE(
                            (100.0 * SUM(hispanic_latino)::numeric / NULLIF(SUM(total_population)::numeric,0)),
                            0
                    ), 1
            ) AS hispanic_pct,
            COUNT(*) AS outages
        FROM outages_geojson
        WHERE zip_code = ANY($1)
        GROUP BY zip_code
        ORDER BY zip_code;
    `;

    try {
        const result = await pool.query(sql, [zips]);
        if (!result.rows.length) {
            return {
                text: "No socioeconomic data found for the selected ZIP codes.",
                visualization: null,
                metrics: null
            };
        }

        const labels = result.rows.map(r => r.zip_code);
        const median_income = result.rows.map(r => r.median_income);
        const poverty_rate = result.rows.map(r => r.poverty_rate);
        const median_age = result.rows.map(r => r.median_age);
        const white_pct = result.rows.map(r => r.white_pct);
        const black_pct = result.rows.map(r => r.black_pct);
        const hispanic_pct = result.rows.map(r => r.hispanic_pct);
        const outages = result.rows.map(r => r.outages);

        return {
            text: `Here are the socioeconomic factors for each ZIP, split into two charts for clarity. Next, type: weather to see weather impacts.`,
            visualization: 'socioeconomic_correlations',
            metrics: {
                labels,
                datasets: [
                    [ // First chart
                        { label: 'Median Income', data: median_income },
                        { label: 'Outages', data: outages }
                    ],
                    [ // Second chart
                        { label: 'Poverty Rate (%)', data: poverty_rate },
                        { label: 'Median Age', data: median_age },
                        { label: 'White (%)', data: white_pct },
                        { label: 'Black (%)', data: black_pct },
                        { label: 'Hispanic (%)', data: hispanic_pct }
                    ]
                ]
            }
        };

    } catch (err) {
        console.error("❌ Error fetching correlations summary:", err);
        return {
            text: "⚠️ Failed to retrieve socioeconomic data.",
            visualization: null,
            metrics: null
        };
    }
}


async function getWeatherImpactSummary(zips) {
    const sql = `
        SELECT
            zip_code,
            ROUND(AVG(temperature_2m)::numeric, 1) AS avg_temp,
            ROUND(AVG(wind_speed_10m)::numeric, 1) AS avg_wind,
            ROUND(MAX(wind_gusts_10m)::numeric, 1) AS max_gust,
            ROUND(SUM(precipitation)::numeric, 1) AS total_precip,
            ROUND(SUM(snowfall)::numeric, 1) AS total_snowfall
        FROM outages_geojson
        WHERE zip_code = ANY($1)
        GROUP BY zip_code
        ORDER BY zip_code;
    `;

    try {
        const result = await pool.query(sql, [zips]);
        if (!result.rows.length) {
            return {
                text: "No weather data found for the selected ZIP codes.",
                visualization: null,
                metrics: null
            };
        }

        const labels = result.rows.map(r => r.zip_code);
        const avg_temp = result.rows.map(r => r.avg_temp);
        const avg_wind = result.rows.map(r => r.avg_wind);
        const max_gust = result.rows.map(r => r.max_gust);
        const total_precip = result.rows.map(r => r.total_precip);
        const total_snowfall = result.rows.map(r => r.total_snowfall);

        return {
            text: `Here’s the weather impacts for each ZIP code. Finally, type: total to see most affected areas.`,
            visualization: 'weather_impact',
            metrics: {
                labels,
                datasets: [
                    { label: 'Avg Temp (°F)', data: avg_temp },
                    { label: 'Avg Wind (m/s)', data: avg_wind },
                    { label: 'Max Gust (m/s)', data: max_gust },
                    { label: 'Precipitation (mm)', data: total_precip },
                    { label: 'Snowfall (cm)', data: total_snowfall }
                ]
            }
        };
    } catch (err) {
        console.error("❌ Error fetching weather impact summary:", err);
        return {
            text: "⚠️ Failed to retrieve weather data.",
            visualization: null,
            metrics: null
        };
    }
}



async function getTopAffectedSummary(zips) {
    const sql = `
        SELECT
            zip_code,
            po_name AS city,
            COUNT(*) AS outages,
            SUM(estcustaffected)::int AS customers
        FROM outages_geojson
        WHERE zip_code = ANY($1)
        GROUP BY zip_code, po_name
        ORDER BY customers DESC
            LIMIT 5;
    `;

    try {
        const result = await pool.query(sql, [zips]);
        if (!result.rows.length) {
            return { text: "No affected areas found for the selected ZIP codes." };
        }

        const labels = result.rows.map(r => `${r.city} (${r.zip_code})`);
        const data = result.rows.map(r => r.customers);

        return {
            text: `Here are the areas most affected by outages.`,
            visualization: 'top_affected',
            metrics: {
                labels,
                datasets: [{
                    label: 'Customers Affected',
                    data
                }]
            }
        };
    } catch (err) {
        console.error("❌ Error fetching top areas:", err);
        return { text: "⚠️ Failed to retrieve top affected areas." };
    }
}




// Tutorial prompts (logic lives here)
const tutorialMessages = {
    tutorial_intro: () => `In a sea of data it’s hard to see insights. I’ll guide you through! Try typing a zip code: **add 12345** to start.`,
    add_zips: (zips) => {
        if (zips.length >= 5) {
            return `5 ZIPs is a good amount: ${zips.join(', ')}. Let’s try the next step: type **compare**.`;
        }
        return `You’ve added: ${zips.join(', ') || '(none)'} — add more ZIPs with **add 12345**, or type **compare** when ready.`;
    },
    compare: () => `Here’s how these ZIPs compare over time! Notice differences in trends? Try typing: **explore economic correlations**`,
    correlations: () => `Now see how socioeconomic factors might explain those patterns. Next, type: **analyze weather**.`,
    weather: () => `Here’s how weather impacts outages. Finally, select a timeframe & type: **explain timeframe**.`,
    top_areas: () => `These are the most affected areas during that timeframe.`,
    end: () => `Thanks for exploring the demo with me! 👋`
};



// ===============================
// POST /chat
// ===============================
router.post('/chat', async (req, res) => {
    const { message } = req.body;
    const sessionId = req.ip;

    if (!sessionStates.has(sessionId)) {
        sessionStates.set(sessionId, {
            stage: 'tutorial_intro',
            zips: []
        });
    }
    const state = sessionStates.get(sessionId);

    if (!chatHistories.has(sessionId)) {
        chatHistories.set(sessionId, [
            {
                role: "system",
                content: `
You help users understand power outage and community data. Be friendly and clear.
                `.trim()
            }
        ]);
    }
    const history = chatHistories.get(sessionId);
    history.push({ role: "user", content: message });

    let responseText = '';

    let visualization = '';
    let metrics = {};

    switch (state.stage) {
        case 'tutorial_intro':
            state.stage = 'add_zips';
            responseText = tutorialMessages.tutorial_intro();
            break;

        case 'add_zips':
            if (/add (\d{5})/i.test(message)) {
                const zip = message.match(/add (\d{5})/i)[1];
                if (!state.zips.includes(zip) && state.zips.length < 5) {
                    state.zips.push(zip);
                }
                responseText = tutorialMessages.add_zips(state.zips);
            } else if (/compare/i.test(message)) {
                const compResult = await getComparisonSummary(state.zips);
                responseText = compResult.text;
                visualization = compResult.visualization;
                metrics = compResult.metrics;
                state.stage = 'correlations';
            } else {
                responseText = tutorialMessages.add_zips(state.zips);
            }
            break;

        case 'correlations': {
            const corrResult = await getCorrelationsSummary(state.zips);
            responseText = corrResult.text;
            visualization = corrResult.visualization;
            metrics = corrResult.metrics;
            state.stage = 'weather';
            break;
        }

        case 'weather': {
            const weatherResult = await getWeatherImpactSummary(state.zips);
            responseText = weatherResult.text;
            visualization = weatherResult.visualization;
            metrics = weatherResult.metrics;
            state.stage = 'top_areas';
            break;
        }

        case 'top_areas': {
            const topResult = await getTopAffectedSummary(state.zips);
            responseText = topResult.text;
            visualization = topResult.visualization;
            metrics = topResult.metrics;
            state.stage = 'end';
            break;
        }

        case 'end':
            responseText = tutorialMessages.end();
            break;

        default:
            state.stage = 'tutorial_intro';
            responseText = tutorialMessages.tutorial_intro();
    }

    try {
        let reply = responseText;  // fallback if no metrics

        if (metrics && visualization) {
            // LLM analyzes metrics
            const llmResponse = await openai.chat.completions.create({
                model: "gpt-4o",
                messages: [
                    {
                        role: "system",
                        content: `
You are a data analyst helping common non trained users understand patterns, trends, and anomalies in power outage, socioeconomic, and weather data. 
Given the following JSON metrics for selected ZIP codes, explain clearly and concisely what patterns you see, what stands out, and what might be actionable.
If some values seem unusually high or low, call them out.
Do not just repeat the numbers — analyze them and provide insight.
`.trim()
                    },
                    {
                        role: "user",
                        content: JSON.stringify({ stage: state.stage, metrics })
                    }
                ]
            });

            reply = llmResponse.choices[0].message.content.trim();
        } else {
            // No metrics, just tutorial text
            reply = responseText;
        }

        history.push({ role: "assistant", content: reply });

        res.json({ reply, zips: state.zips, visualization, metrics });


    } catch (err) {
        console.error("OpenAI Error:", err);
        res.status(500).json({error: "Chat failed"});
    }
});



module.exports = router;
