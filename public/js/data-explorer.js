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
    const sendBtn = document.querySelector('button[onclick="submitChat()"]');

    const chatMessages = document.getElementById('chatMessages');
    const userMessage = input.value.trim();
    if (!userMessage) return;

    // Disable input
    input.disabled = true;
    sendBtn.disabled = true;

    chatMessages.innerHTML += `<div class="chat-bubble user">${userMessage}</div>`;
    document.getElementById('onboardingCard')?.remove();
    input.value = "";
    chatMessages.scrollTop = chatMessages.scrollHeight;

    if (!mapShown) {
        showMap();
        mapShown = true;
    }

    const placeholder = document.createElement('div');
    placeholder.className = 'chat-bubble assistant';
    placeholder.innerHTML = `
    <div class="thinking-dots">
        <span></span><span></span><span></span>
    </div>
`;
    chatMessages.scrollTop = chatMessages.scrollHeight;
    chatMessages.appendChild(placeholder);

    try {
        const res = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: userMessage })
        });
        const data = await res.json();

        placeholder.textContent = data.reply;
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

    } catch (err) {
        placeholder.textContent = "⚠️ Failed to get response.";
        console.error(err);
    } finally {
        // Re-enable input
        input.disabled = false;
        sendBtn.disabled = false;
        input.focus();
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
        data: {
            labels: metrics.labels,
            datasets: metrics.datasets.map((ds, i) => ({
                ...ds,
                backgroundColor: ds.backgroundColor || `hsl(${i * 60}, 70%, 50%)`,
                borderColor: ds.borderColor || `hsl(${i * 60}, 70%, 40%)`
            }))
        },
        options: {
            responsive: true,
            scales: { y: { beginAtZero: true } }
        }
    });

    document.getElementById('chartIndexDisplay').textContent =
        `Chart ${currentChartIndex + 1} of ${chartHistory.length}`;

    document.getElementById('prevChartBtn').disabled = currentChartIndex === 0;
    document.getElementById('nextChartBtn').disabled = currentChartIndex === chartHistory.length - 1;

    setTimeout(() => {
        document.getElementById('visualization').scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
}

function updateMapWithGeoJSON(geojson) {
    markerClusterGroup.clearLayers();

    const bounds = [];

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
        bounds.push([lat, lon]);
    });

    map.addLayer(markerClusterGroup);
    map.invalidateSize();

    if (bounds.length > 0) {
        const latLngBounds = L.latLngBounds(bounds);
        map.fitBounds(latLngBounds, { padding: [20, 20] });
    }
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

document.getElementById('downloadChartBtn').addEventListener('click', () => {
    const link = document.createElement('a');
    link.href = window.currentChart.toBase64Image();
    link.download = `chart_${currentChartIndex + 1}.png`;
    link.click();
});
document.getElementById('downloadReportBtn').addEventListener('click', async () => {
    const { jsPDF } = window.jspdf;

    const doc = new jsPDF({
        unit: 'in',
        format: 'letter'
    });

    // Load logo
    const logo = new Image();
    logo.src = '/images/College/CECS/Horizontal/PNGs/CECS_marketing_CMYK.png';
    await new Promise(resolve => {
        logo.onload = resolve;
        logo.onerror = resolve; // Continue even if logo fails to load
    });

    // Page dimensions and IEEE-compliant margins
    const pageWidth = 8.5;
    const pageHeight = 11;
    const margins = {
        top: 0.6,
        bottom: 0.5,
        inner: 0.75,
        outer: 0.75,
        headerFooter: 0.3
    };

    // Content area calculations
    const contentWidth = pageWidth - margins.inner - margins.outer;
    const contentStartY = margins.top;
    const contentEndY = pageHeight - margins.bottom;

    // Document info
    const currentDate = new Date();
    const dateStr = currentDate.toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric'
    });
    const year = currentDate.getFullYear().toString().slice(-2);
    const docId = `doc.: IEEE 802.22-${year}/0001r0`;

    let pageNumber = 1;

    const addHeader = () => {
        // IEEE Header format
        doc.setFont("Times", "bold");
        doc.setFontSize(14);

        // Date on left
        doc.text(dateStr, margins.inner, margins.headerFooter);

        // Document ID on right
        doc.text(docId, pageWidth - margins.outer, margins.headerFooter, { align: 'right' });

        // Header line (2 points separation)
        doc.setLineWidth(0.005);
        doc.line(margins.inner, margins.headerFooter + 0.02, pageWidth - margins.outer, margins.headerFooter + 0.02);
    };

    const addFooter = () => {
        const footerY = pageHeight - margins.headerFooter;

        // Footer line
        doc.setLineWidth(0.005);
        doc.line(margins.inner, footerY - 0.02, pageWidth - margins.outer, footerY - 0.02);

        doc.setFont("Times", "normal");
        doc.setFontSize(12);

        // Page number in center
        doc.text(`page ${pageNumber}`, pageWidth / 2, footerY, { align: 'center' });

        // Power Lab, UM-Dearborn on right
        doc.text("Power Lab, UM-Dearborn", pageWidth - margins.outer, footerY, { align: 'right' });
    };

    const addLogo = () => {
        if (logo.complete && logo.naturalWidth > 0) {
            // Logo dimensions: 1304x75 pixels, scale to fit nicely
            const logoWidth = 1.5; // inches
            const logoHeight = (75 / 1304) * logoWidth; // maintain aspect ratio

            // Position at bottom right corner
            const logoX = pageWidth - margins.outer - logoWidth;
            const logoY = pageHeight - margins.bottom - logoHeight - 0.1;

            doc.addImage(logo, 'PNG', logoX, logoY, logoWidth, logoHeight);
        }
    };

    const addNewPage = () => {
        if (pageNumber > 1) doc.addPage();
        addHeader();
        addFooter();
        addLogo();
        pageNumber++;
    };

    // Initialize first page
    addHeader();
    addFooter();
    addLogo();

    let currentY = contentStartY;

    // Title
    doc.setFont("Times", "bold");
    doc.setFontSize(18);
    doc.text("Energy Outage Explorer Report", pageWidth / 2, currentY, { align: "center" });
    currentY += 0.4;

    // Subtitle
    doc.setFont("Times", "normal");
    doc.setFontSize(14);
    doc.text("Power Lab, University of Michigan-Dearborn", pageWidth / 2, currentY, { align: "center" });
    currentY += 0.5;

    // Generation info
    doc.setFont("Times", "normal");
    doc.setFontSize(12);
    doc.text(`Generated on: ${currentDate.toLocaleString()}`, margins.inner, currentY);
    currentY += 0.3;

    // Conversation History Section
    doc.setFont("Times", "bold");
    doc.setFontSize(14);
    doc.text("Conversation History", margins.inner, currentY);
    currentY += 0.2;

    // Process chat messages with better formatting
    const chatMessages = document.querySelectorAll('#chatMessages .chat-bubble');

    chatMessages.forEach((bubble, index) => {
        const isUser = bubble.classList.contains('user');
        const role = isUser ? 'User' : 'Assistant';
        const content = bubble.textContent.trim();

        // Check if we need a new page
        const estimatedHeight = 0.3 + (content.length / 60) * 0.15; // rough estimate
        if (currentY + estimatedHeight > contentEndY - 0.5) {
            addNewPage();
            currentY = contentStartY;
        }

        // Role header
        doc.setFont("Times", "bold");
        doc.setFontSize(11);
        doc.text(`${role}:`, margins.inner, currentY);
        currentY += 0.18;

        // Message content with proper text wrapping
        doc.setFont("Times", "normal");
        doc.setFontSize(10);

        // Handle HTML content (bold, italics, line breaks)
        const htmlContent = bubble.innerHTML;
        const lines = [];

        // Simple HTML parsing for basic formatting
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = htmlContent;

        // Extract text with basic formatting
        const textContent = tempDiv.textContent || tempDiv.innerText || '';
        const wrappedLines = doc.splitTextToSize(textContent, contentWidth - 0.2);

        // Add indentation for message content
        wrappedLines.forEach(line => {
            doc.text(line, margins.inner + 0.2, currentY);
            currentY += 0.15;
        });

        currentY += 0.1; // Extra spacing between messages

        // Check again for page break
        if (currentY > contentEndY - 0.3) {
            addNewPage();
            currentY = contentStartY;
        }
    });

    // Charts Section
    currentY += 0.2;
    doc.setFont("Times", "bold");
    doc.setFontSize(14);
    doc.text("Data Visualizations", margins.inner, currentY);
    currentY += 0.3;

    // Process charts
    for (let i = 0; i < chartHistory.length; i++) {
        const chartHeight = 2.5;
        const totalChartSpace = chartHeight + 0.5;

        // Check if we need a new page for this chart
        if (currentY + totalChartSpace > contentEndY - 0.3) {
            addNewPage();
            currentY = contentStartY;
        }

        // Chart title
        doc.setFont("Times", "bold");
        doc.setFontSize(12);
        const chartTitle = chartHistory[i].type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        doc.text(`Figure ${i + 1}: ${chartTitle}`, margins.inner, currentY);
        currentY += 0.2;

        // Render chart
        const canvas = document.getElementById('chartCanvas');
        const chart = chartHistory[i];

        showChart(chart.metrics, chart.type);
        await new Promise(resolve => setTimeout(resolve, 300));

        // Capture and add chart image
        await html2canvas(canvas, {
            backgroundColor: '#ffffff',
            scale: 2 // Higher resolution
        }).then(canvasImg => {
            const imgData = canvasImg.toDataURL('image/png');
            doc.addImage(
                imgData,
                'PNG',
                margins.inner,
                currentY,
                contentWidth,
                chartHeight
            );
        });

        currentY += chartHeight + 0.3;
    }

    // Add summary section if there's space
    if (currentY < contentEndY - 1) {
        currentY += 0.2;
        doc.setFont("Times", "bold");
        doc.setFontSize(14);
        doc.text("Summary", margins.inner, currentY);
        currentY += 0.2;

        doc.setFont("Times", "normal");
        doc.setFontSize(12);
        const summaryText = "This report presents an analysis of energy outage data through interactive exploration and visualization. The conversation history shows the user's journey through the data, while the charts provide visual insights into outage patterns and correlations.";
        const summaryLines = doc.splitTextToSize(summaryText, contentWidth);
        summaryLines.forEach(line => {
            doc.text(line, margins.inner, currentY);
            currentY += 0.15;
        });
    }

    // Save the document
    doc.save(`Energy_Outage_IEEE_Report_${Date.now()}.pdf`);
});
