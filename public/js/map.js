// document.addEventListener('DOMContentLoaded', () => {
//     const map = L.map('map').setView([37.8, -96], 5);
//
//     L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
//         attribution:
//             '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
//         maxZoom: 18
//     }).addTo(map);
//
//     const markerCluster = L.markerClusterGroup();
//
//     fetch('data/outages.json')
//         .then(res => res.json())
//         .then(data => {
//             data.forEach(outage => {
//                 const lat = outage.OUTAGE_LATITUDE || outage.lat;
//                 const lng = outage.OUTAGE_LONGITUDE || outage.lng;
//                 if (!lat || !lng) return;
//
//                 const desc = `
//                     <strong>${outage.CITY || 'Unknown Location'}</strong><br>
//                     ${outage.OUTAGE_CAUSE || 'No cause listed'}<br>
//                     <em>${outage.CREW_CURRENT_STATUS}</em><br>
//                     Est. Customers: ${outage.EST_CUSTOMERS || 1}
//                 `;
//
//                 const marker = L.marker([lat, lng]);
//                 marker.bindPopup(desc);
//                 markerCluster.addLayer(marker);
//             });
//
//             map.addLayer(markerCluster);
//         })
//         .catch(err => {
//             console.error('Failed to load outage data:', err);
//         });
// });
