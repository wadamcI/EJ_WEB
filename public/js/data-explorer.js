console.log("✅ data-explorer.js loaded");

let map, markerClusterGroup;
let mapShown = false;
const chartHistory = [];
let currentChartIndex = 0;

document.addEventListener('DOMContentLoaded', () => {
    const chatMessages = document.getElementById('chatMessages');
    chatMessages.innerHTML += `
        <div class="chat-bubble assistant">
            Hello, User! This is a tool to help you better navigate outage data. Enter anything to start!
        </div>
    `;

    map = L.map('map').setView([37.3, -121.8], 5);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 18,
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    markerClusterGroup = L.markerClusterGroup();
    map.addLayer(markerClusterGroup);

    setupSlider();

    document.getElementById('chatInput').addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            submitChat();
        }
    });

    document.getElementById('prevChartBtn').addEventListener('click', showPrevChart);
    document.getElementById('nextChartBtn').addEventListener('click', showNextChart);
});

function setupSlider() {
    const slider = document.getElementById('slider');
    const dateValues = [
        document.getElementById('event-start'),
        document.getElementById('event-end')
    ];
    const formatter = new Intl.DateTimeFormat('en-GB', { dateStyle: 'full' });

    function timestamp(str) {
        return new Date(str + 'T00:00:00Z').getTime();
    }

    fetch('/api/dates')
        .then(res => res.json())
        .then(({ minDate, maxDate }) => {
            console.log(`📅 Date range: ${minDate} → ${maxDate}`);

            noUiSlider.create(slider, {
                range: { min: timestamp(minDate), max: timestamp(maxDate) },
                step: 24 * 60 * 60 * 1000,
                start: [timestamp(minDate), timestamp(maxDate)],
                format: wNumb({ decimals: 0 }),
                connect: true
            });

            slider.noUiSlider.on('update', (values, handle) => {
                const dateStr = formatter.format(new Date(+values[handle]));
                dateValues[handle].textContent = dateStr;
            });
        })
        .catch(err => console.error('Error fetching date range:', err));
}

async function submitChat() {
    const input = document.getElementById('chatInput');
    const chatMessages = document.getElementById('chatMessages');
    const userMessage = input.value.trim();
    if (!userMessage) return;

    chatMessages.innerHTML += `<div class="chat-bubble user">${userMessage}</div>`;
    input.value = "";
    chatMessages.scrollTop = chatMessages.scrollHeight;

    if (!mapShown) {
        showMap();
        mapShown = true;
    }

    const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMessage })
    });
    const data = await res.json();

    chatMessages.innerHTML += `<div class="chat-bubble assistant">${data.reply}</div>`;
    chatMessages.scrollTop = chatMessages.scrollHeight;

    if (data.zips?.length) {
        const slider = document.getElementById('slider');
        const values = slider.noUiSlider.get().map(v => +v);
        const startDateIso = new Date(values[0]).toISOString().split('T')[0];
        const endDateIso = new Date(values[1]).toISOString().split('T')[0];
        fetchAndUpdateMap(data.zips, startDateIso, endDateIso);
    }

    if (data.metrics && data.visualization) {
        handleChartResponse(data);
    }
}

function handleChartResponse(data) {
    if (Array.isArray(data.metrics.datasets[0])) {
        // Split charts
        data.metrics.datasets.forEach(ds => {
            chartHistory.push({
                metrics: { labels: data.metrics.labels, datasets: ds },
                type: data.visualization
            });
        });
    } else {
        chartHistory.push({
            metrics: data.metrics,
            type: data.visualization
        });
    }
    currentChartIndex = chartHistory.length - 1;
    showChart(chartHistory[currentChartIndex].metrics, chartHistory[currentChartIndex].type);
}

function fetchAndUpdateMap(zips, startDate, endDate) {
    console.log(`🌐 Fetching map data for ZIPs: ${zips.join(', ')} between ${startDate} and ${endDate}`);
    const params = new URLSearchParams({ start: startDate, end: endDate, zips: zips.join(',') });
    fetch(`/api/outages?${params}`)
        .then(res => res.json())
        .then(updateMapWithGeoJSON)
        .catch(err => console.error('Error fetching filtered outages:', err));
}

function showMap() {
    const chat = document.querySelector('.chat-box');
    const mapDiv = document.getElementById('map');
    const sliderDiv = document.getElementById('slider');

    chat.classList.add('shrink');
    mapDiv.classList.add('show');
    sliderDiv.classList.add('show');

    mapDiv.addEventListener('transitionend', () => {
        map.invalidateSize();
    }, { once: true });
}

function showChart(metrics, type) {
    document.getElementById('visualization').style.display = 'block';
    const canvas = document.getElementById('chartCanvas');

    if (window.currentChart) window.currentChart.destroy();

    window.currentChart = new Chart(canvas, {
        type: type === 'outage_timeseries' ? 'line' : 'bar',
        data: { labels: metrics.labels, datasets: metrics.datasets },
        options: {
            responsive: true,
            scales: { y: { beginAtZero: true } }
        }
    });

    document.getElementById('chartIndexDisplay').textContent =
        `Chart ${currentChartIndex + 1} of ${chartHistory.length}`;

    document.getElementById('prevChartBtn').disabled = currentChartIndex === 0;
    document.getElementById('nextChartBtn').disabled = currentChartIndex === chartHistory.length - 1;
}

function updateMapWithGeoJSON(geojson) {
    markerClusterGroup.clearLayers();

    geojson.features.forEach(outage => {
        const coords = outage.geometry.coordinates;
        const [lon, lat] = Array.isArray(coords[0]) ? coords[0] : coords;

        const marker = L.circleMarker([lat, lon], {
            radius: 5,
            color: "blue",
            fillColor: "blue",
            fillOpacity: 0.5
        });

        markerClusterGroup.addLayer(marker);
    });

    map.addLayer(markerClusterGroup);
    map.invalidateSize();
}

function showPrevChart() {
    if (currentChartIndex > 0) {
        currentChartIndex--;
        const { metrics, type } = chartHistory[currentChartIndex];
        showChart(metrics, type);
    }
}

function showNextChart() {
    if (currentChartIndex < chartHistory.length - 1) {
        currentChartIndex++;
        const { metrics, type } = chartHistory[currentChartIndex];
        showChart(metrics, type);
    }
}
