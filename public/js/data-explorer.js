console.log("✅ data-explorer.js loaded");
let map, markerClusterGroup;
let mapShown = false;

document.addEventListener('DOMContentLoaded', () => {

    const chatMessages = document.getElementById('chatMessages');
    chatMessages.innerHTML += `
        <div class="chat-bubble assistant">
            Hi, I’m here to help you explore the outage data. Please enter a ZIP code to continue.
        </div>
    `;

    // create map object
    map = L.map('map').setView([37.3, -121.8], 5);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 18,
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    markerClusterGroup = L.markerClusterGroup();
    let allData = [];

    function updateMap(filterValue = "") {
        console.log("✅ Calling updateMap with", allData.length, "features");
        markerClusterGroup.clearLayers();

        allData.forEach(outage => {
            const { geometry, properties } = outage;
            let coords = geometry?.coordinates;

            // If nested (e.g., [[lon, lat]]), unwrap it
            if (Array.isArray(coords) && Array.isArray(coords[0])) {
                coords = coords[0];
            }

            if (!Array.isArray(coords) || coords.length < 2 || typeof coords[0] !== 'number' || typeof coords[1] !== 'number') {
                console.warn("⚠️ Invalid coordinates:", coords, "types:", typeof coords[0], typeof coords[1]);
                return;
            }

            const [lon, lat] = coords;
            console.log("📍 Adding marker at", lat, lon);

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
        console.log("🗺️ Added marker cluster to map");
    }

    fetch('/api/outages?start=2019-06-01&end=2019-06-12')
        .then(res => res.json())
        .then(data => {
            console.log("✅ Fetched data:", data);
            allData = data.features || [];
            updateMap();
        })
        .catch(err => console.error('Error loading outage data:', err));


    const slider = document.getElementById('slider');
    const dateValues = [
        document.getElementById('event-start'),
        document.getElementById('event-end')
    ];

    function timestamp(str) {
        return new Date(str + 'T00:00:00Z').getTime();
    }

    const formatter = new Intl.DateTimeFormat('en-GB', {
        dateStyle: 'full'
    });

    fetch('/api/dates')
        .then(res => res.json())
        .then(({ minDate, maxDate }) => {
            console.log(`📅 Date range: ${minDate} → ${maxDate}`);

            noUiSlider.create(slider, {
                range: {
                    min: timestamp(minDate),
                    max: timestamp(maxDate)
                },
                step: 24 * 60 * 60 * 1000, // one day
                start: [timestamp(minDate), timestamp(maxDate)],
                format: wNumb({ decimals: 0 }),
                connect: true
            });

            slider.noUiSlider.on('update', (values, handle) => {
                const dateStr = formatter.format(new Date(+values[handle]));
                dateValues[handle].textContent = dateStr;

                // Optionally fetch and update map only once both handles updated
                const [startMs, endMs] = values.map(v => +v);
                const startDateIso = new Date(startMs).toISOString().split('T')[0];
                const endDateIso = new Date(endMs).toISOString().split('T')[0];

                console.log(`📅 Slider updated: ${startDateIso} → ${endDateIso}`);

                fetch(`/api/outages?start=${startDateIso}&end=${endDateIso}`)
                    .then(res => res.json())
                    .then(data => {
                        updateMapWithGeoJSON(data);
                    })
                    .catch(err => console.error('Error fetching filtered outages:', err));
            });
        })
        .catch(err => console.error('Error fetching date range:', err));





    document.getElementById('chatInput').addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault(); // prevent newline
            submitChat();
        }
    });

});

async function submitChat() {
    const input = document.getElementById('chatInput');
    const chatMessages = document.getElementById('chatMessages');
    const userMessage = input.value.trim();
    if (!userMessage) return;

    chatMessages.innerHTML += `<div class="chat-bubble user">${userMessage}</div>`;
    input.value = "";

    if (!mapShown) {
        showMap();
        mapShown = true;
    }

    // Fetch AFTER sending user message
    const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMessage })
    });

    const data = await res.json();

    //  Always show assistant reply
    chatMessages.innerHTML += `<div class="chat-bubble assistant">${data.reply}</div>`;
    chatMessages.scrollTop = chatMessages.scrollHeight;

    //  If metrics provided → show chart
    if (data.metrics && data.visualization) {
        showChart(data.metrics, data.visualization);
    }
}


function showMap() {
    const chat = document.querySelector('.chat-box');
    const mapDiv = document.getElementById('map');
    const sliderDiv = document.getElementById('slider');

    chat.classList.add('shrink');
    mapDiv.classList.add('show');
    sliderDiv.classList.add('show');

    // wait for the CSS transition
    mapDiv.addEventListener('transitionend', () => {
        console.log("🌀 Transition ended, invalidating map");
        map.invalidateSize();
    }, 4000, { once: true });

}

function showChart(metrics, type) {
    const vizSection = document.getElementById('visualization');
    const canvas = document.getElementById('chartCanvas');

    vizSection.style.display = 'block';

    const labels = Object.keys(metrics);
    const values = Object.values(metrics);

    const chartType = type === 'line_chart' ? 'line' : 'bar';

    new Chart(canvas, {
        type: chartType,
        data: {
            labels: labels,
            datasets: [{
                label: 'Metrics',
                data: values,
                backgroundColor: 'rgba(0,123,255,0.5)',
                borderColor: 'rgba(0,123,255,1)',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            scales: {
                y: { beginAtZero: true }
            }
        }
    });
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



