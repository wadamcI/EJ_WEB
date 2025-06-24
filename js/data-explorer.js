document.addEventListener('DOMContentLoaded', () => {
    const map = L.map('map').setView([37.3, -121.8], 5);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 18,
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    const markerClusterGroup = L.markerClusterGroup();
    let allData = [];

    function updateMap(filterValue = "") {
        markerClusterGroup.clearLayers();

        allData.forEach(outage => {
            const { geometry, properties } = outage;
            if (!geometry || !geometry.coordinates) return;

            const { coordinates } = geometry;
            const { CITY, OUTAGE_CAUSE, EST_CUSTOMERS, CREW_CURRENT_STATUS } = properties;

            if (filterValue && OUTAGE_CAUSE !== filterValue) return;

            const causeColorMap = {
                "Tree Limb": "green",
                "Storm Damage": "blue",
                "Transformer Failure": "red",
                "Unknown": "gray"
            };

            const color = causeColorMap[OUTAGE_CAUSE] || "black";

            const marker = L.circleMarker([coordinates[1], coordinates[0]], {
                radius: Math.max(5, Math.min((EST_CUSTOMERS || 1) / 2, 20)),
                color,
                fillColor: color,
                fillOpacity: 0.7,
                weight: 1
            });

            marker.on('click', () => {
                const reportHTML = `
                    <h3>Outage Report</h3>
                    <p><strong>Location:</strong> ${CITY || 'Unknown City'}</p>
                    <p><strong>Cause:</strong> ${OUTAGE_CAUSE}</p>
                    <p><strong>Crew Status:</strong> ${CREW_CURRENT_STATUS || 'Unknown'}</p>
                    <p><strong>Estimated Customers Affected:</strong> ${EST_CUSTOMERS}</p>
                    <p><strong>Coordinates:</strong> (${coordinates[1].toFixed(4)}, ${coordinates[0].toFixed(4)})</p>
                `;
                document.getElementById('report-panel').innerHTML = reportHTML;
            });

            markerClusterGroup.addLayer(marker);
        });

        map.addLayer(markerClusterGroup);
    }

    fetch('../data/outages.json')
        .then(res => res.json())
        .then(data => {
            allData = data.features || [];
            updateMap();
        })
        .catch(err => console.error('Error loading outage data:', err));

    document.getElementById('causeFilter').addEventListener('change', e => {
        updateMap(e.target.value);
    });
});

function submitChat() {
    const input = document.getElementById('chatInput');
    const chatMessages = document.getElementById('chatMessages');

    const userMessage = input.value.trim();
    if (!userMessage) return;

    const userBubble = `<div class="chat-bubble user">${userMessage}</div>`;
    const assistantBubble = `<div class="chat-bubble assistant">I'm UM-D Power AI — here to help you understand your outage data.</div>`;

    chatMessages.innerHTML += userBubble + assistantBubble;

    input.value = "";
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

document.getElementById('chatInput').addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault(); // prevent newline
        submitChat();
    }
});

