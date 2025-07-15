
# EJ_WEB
# Energy Justice Web (EJ_WEB)

This project contains a small website and Node.js server used by the UM‑Dearborn Energy Access Research Group. The site provides an interactive map for exploring power outages and pages highlighting ongoing research on energy justice.

## Features

- **Interactive Data Explorer** – Leaflet and MarkerCluster display outage locations from a GeoJSON dataset.
- **REST API** – Express routes expose outage data from PostgreSQL and an OpenAI‑backed chat endpoint.
- **Informational Pages** – Additional pages share FAQs, research findings and policy recommendations.

## Getting Started

1. Install dependencies:
   ```bash
   npm install
   ```
2. Create a `.env` file with your database credentials and OpenAI key:
   ```
   OPENAI_API_KEY=your_key_here
   DB_USER=postgres
   DB_PASSWORD=mysecretpassword
   DB_HOST=localhost
   DB_NAME=mytest
   DB_PORT=5432
   ```
3. Start the server:
   ```bash
   node index.js
   ```
   The site will be available at [http://localhost:3000](http://localhost:3000).

## Repository Layout

```
.
├── data/               # Sample outage data
├── images/             # UM-Dearborn logos
├── js/                 # Server routes (chat)
├── maps/               # Client-side map script
├── pages/              # Secondary HTML pages
├── index.js            # Express server
├── index.html          # Landing page
└── styles.css          # Basic styling
```

Feel free to modify the server configuration in `index.js` to point to your database and adjust the map or pages as needed.
