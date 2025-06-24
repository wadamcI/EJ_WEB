console.log("✅ data-explorer.js loaded");
document.addEventListener('DOMContentLoaded', () => {
    const map = L.map('map').setView([37.3, -121.8], 5);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 18,
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    const markerClusterGroup = L.markerClusterGroup();
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

    document.getElementById('causeFilter').addEventListener('change', e => {
        updateMap(e.target.value);
    });
});

async function submitChat() {
    const input = document.getElementById('chatInput');
    const chatMessages = document.getElementById('chatMessages');
    const userMessage = input.value.trim();
    if (!userMessage) return;

    chatMessages.innerHTML += `<div class="chat-bubble user">${userMessage}</div>`;
    input.value = "";

    const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMessage })
    });

    const data = await res.json();
    chatMessages.innerHTML += `<div class="chat-bubble assistant">${data.reply}</div>`;
    chatMessages.scrollTop = chatMessages.scrollHeight;
}



document.getElementById('chatInput').addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault(); // prevent newline
        submitChat();
    }
});

