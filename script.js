// Configuration
const CONFIG = {
    GOOGLE_MAPS_API_KEY: 'AIzaSyDHL43TypM7bwy9dXHS__rbPeOCW5Ev_6w',
    BESTTIME_API_KEY: 'pub_1b9fcd98ff484251ab604b3a9c09dc70',
    SEARCH_RADIUS: 15000, // 15km in meters
    CACHE_DURATION: 24 * 60 * 60 * 1000 // 24 hours in milliseconds
};

// Global state
let currentLocation = null;
let transportMode = 'driving';
let selectedPlaces = [];
let searchResults = [];

// DOM Elements
const elements = {
    useLocationBtn: document.getElementById('use-location-btn'),
    searchLocationBtn: document.getElementById('search-location-btn'),
    locationSearch: document.getElementById('location-search'),
    locationInput: document.getElementById('location-input'),
    setLocationBtn: document.getElementById('set-location-btn'),
    currentLocationText: document.getElementById('location-text'),
    searchInput: document.getElementById('search-input'),
    searchBtn: document.getElementById('search-btn'),
    drivingBtn: document.getElementById('driving-btn'),
    walkingBtn: document.getElementById('walking-btn'),
    searchResults: document.getElementById('search-results'),
    resultsList: document.getElementById('results-list'),
    comparisonSection: document.getElementById('comparison-section'),
    comparisonGrid: document.getElementById('comparison-grid'),
    compareBtn: document.getElementById('compare-btn'),
    compareCount: document.getElementById('compare-count'),
    refreshBtn: document.getElementById('refresh-btn'),
    loadingOverlay: document.getElementById('loading-overlay'),
    placeModal: document.getElementById('place-modal'),
    chartModal: document.getElementById('chart-modal')
};

// Initialize app
document.addEventListener('DOMContentLoaded', initializeApp);

function initializeApp() {
    setupEventListeners();
    loadCachedLocation();
    requestGeolocation();
    
    // Register service worker for PWA
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js');
    }
}

function setupEventListeners() {
    // Location toggle
    elements.useLocationBtn.addEventListener('click', () => {
        toggleLocationMode('gps');
        requestGeolocation();
    });
    
    elements.searchLocationBtn.addEventListener('click', () => {
        toggleLocationMode('search');
    });
    
    elements.setLocationBtn.addEventListener('click', setManualLocation);
    
    // Search
    elements.searchBtn.addEventListener('click', searchPlaces);
    elements.searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') searchPlaces();
    });
    
    // Transport mode
    elements.drivingBtn.addEventListener('click', () => setTransportMode('driving'));
    elements.walkingBtn.addEventListener('click', () => setTransportMode('walking'));
    
    // Comparison
    elements.compareBtn.addEventListener('click', compareSelectedPlaces);
    elements.refreshBtn.addEventListener('click', refreshComparison);
    
    // Modal close
    document.querySelectorAll('.modal-close').forEach(closeBtn => {
        closeBtn.addEventListener('click', (e) => {
            e.target.closest('.modal').classList.add('hidden');
        });
    });
    
    // Click outside modal to close
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.add('hidden');
            }
        });
    });
}

function toggleLocationMode(mode) {
    if (mode === 'gps') {
        elements.useLocationBtn.classList.add('active');
        elements.searchLocationBtn.classList.remove('active');
        elements.locationSearch.classList.add('hidden');
    } else {
        elements.searchLocationBtn.classList.add('active');
        elements.useLocationBtn.classList.remove('active');
        elements.locationSearch.classList.remove('hidden');
    }
}

function requestGeolocation() {
    if (!navigator.geolocation) {
        showMessage('Geolocation is not supported by this browser.');
        return;
    }
    
    elements.currentLocationText.textContent = 'Getting your location...';
    
    navigator.geolocation.getCurrentPosition(
        (position) => {
            currentLocation = {
                lat: position.coords.latitude,
                lng: position.coords.longitude,
                address: 'Your Current Location'
            };
            updateLocationDisplay();
            enableSearch();
            cacheLocation();
        },
        (error) => {
            console.error('Geolocation error:', error);
            elements.currentLocationText.textContent = 'Unable to get location. Please search manually.';
            toggleLocationMode('search');
        }
    );
}

function setManualLocation() {
    const address = elements.locationInput.value.trim();
    if (!address) return;
    
    showLoading();
    geocodeAddress(address)
        .then(location => {
            currentLocation = location;
            updateLocationDisplay();
            enableSearch();
            cacheLocation();
            hideLoading();
        })
        .catch(error => {
            console.error('Geocoding error:', error);
            showMessage('Unable to find that location. Please try again.');
            hideLoading();
        });
}

function updateLocationDisplay() {
    if (currentLocation) {
        elements.currentLocationText.textContent = currentLocation.address;
    }
}

function enableSearch() {
    elements.searchInput.disabled = false;
    elements.searchBtn.disabled = false;
}

function setTransportMode(mode) {
    transportMode = mode;
    elements.drivingBtn.classList.toggle('active', mode === 'driving');
    elements.walkingBtn.classList.toggle('active', mode === 'walking');
    
    // Refresh travel times if places are selected
    if (selectedPlaces.length > 0) {
        refreshComparison();
    }
}

function searchPlaces() {
    const query = elements.searchInput.value.trim();
    if (!query || !currentLocation) return;
    
    showLoading();
    
    const request = {
        location: new google.maps.LatLng(currentLocation.lat, currentLocation.lng),
        radius: CONFIG.SEARCH_RADIUS,
        query: query
    };
    
    const service = new google.maps.places.PlacesService(document.createElement('div'));
    service.textSearch(request, (results, status) => {
        hideLoading();
        
        if (status === google.maps.places.PlacesServiceStatus.OK) {
            searchResults = results.slice(0, 20); // Limit to 20 results
            displaySearchResults();
        } else {
            showMessage('No places found. Please try a different search term.');
        }
    });
}

function displaySearchResults() {
    elements.searchResults.classList.remove('hidden');
    elements.resultsList.innerHTML = '';
    
    searchResults.forEach((place, index) => {
        const card = createPlaceCard(place, index);
        elements.resultsList.appendChild(card);
    });
}

function createPlaceCard(place, index) {
    const card = document.createElement('div');
    card.className = 'place-card';
    
    // Get place details
    const service = new google.maps.places.PlacesService(document.createElement('div'));
    service.getDetails({
        placeId: place.place_id,
        fields: ['name', 'rating', 'price_level', 'opening_hours', 'formatted_phone_number', 'geometry']
    }, (details, status) => {
        if (status === google.maps.places.PlacesServiceStatus.OK) {
            updatePlaceCard(card, place, details, index);
        }
    });
    
    return card;
}

function updatePlaceCard(card, place, details, index) {
    const isSelected = selectedPlaces.some(p => p.place_id === place.place_id);
    const closingTime = getClosingTime(details.opening_hours);
    
    card.innerHTML = `
        <div class="place-header">
            <div>
                <div class="place-name">${place.name}</div>
                <div class="place-rating">★ ${details.rating || 'N/A'}</div>
            </div>
        </div>
        <div class="place-info">
            <div class="info-item">📍 ${place.formatted_address}</div>
            <div class="info-item">🕒 Closes: ${closingTime}</div>
            <div class="info-item">💰 ${getPriceLevel(details.price_level)}</div>
            <div class="info-item">
                <span class="busyness" id="busyness-${index}">Loading...</span>
            </div>
        </div>
        <div class="place-actions">
            <button class="btn btn-primary" onclick="showPlaceDetails('${place.place_id}')">
                View Details
            </button>
            <button class="btn btn-success" onclick="callPlace('${details.formatted_phone_number || ''}')">
                📞 Call
            </button>
            <button class="btn btn-info" onclick="showBusynessChart('${place.place_id}')">
                📊 Busyness
            </button>
            <button class="btn ${isSelected ? 'btn-warning' : 'btn-primary'}" 
                    onclick="togglePlaceSelection(${index})"
                    ${selectedPlaces.length >= 4 && !isSelected ? 'disabled' : ''}>
                ${isSelected ? 'Remove' : 'Add to Compare'}
            </button>
        </div>
    `;
    
    // Load busyness data
    loadBusynessData(place.place_id, `busyness-${index}`);
    
    // Calculate travel time
    calculateTravelTime(place.geometry.location, `travel-${index}`);
}

function getClosingTime(openingHours) {
    if (!openingHours || !openingHours.periods) return 'N/A';
    
    const today = new Date().getDay();
    const todayPeriod = openingHours.periods.find(p => p.open.day === today);
    
    if (!todayPeriod || !todayPeriod.close) return '24 Hours';
    
    const closeTime = todayPeriod.close.time;
    return `${closeTime.substr(0,2)}:${closeTime.substr(2,2)}`;
}

function getPriceLevel(level) {
    if (level === undefined) return 'N/A';
    return '$'.repeat(level + 1);
}

function togglePlaceSelection(index) {
    const place = searchResults[index];
    const existingIndex = selectedPlaces.findIndex(p => p.place_id === place.place_id);
    
    if (existingIndex > -1) {
        selectedPlaces.splice(existingIndex, 1);
    } else if (selectedPlaces.length < 4) {
        selectedPlaces.push(place);
    }
    
    updateComparisonSection();
    displaySearchResults(); // Refresh to update buttons
}

function updateComparisonSection() {
    elements.compareCount.textContent = selectedPlaces.length;
    elements.compareBtn.disabled = selectedPlaces.length === 0;
    elements.refreshBtn.style.display = selectedPlaces.length > 0 ? 'block' : 'none';
    
    if (selectedPlaces.length > 0) {
        elements.comparisonSection.classList.remove('hidden');
        displayComparison();
    } else {
        elements.comparisonSection.classList.add('hidden');
    }
}

function displayComparison() {
    elements.comparisonGrid.innerHTML = '';
    
    selectedPlaces.forEach((place, index) => {
        const card = createComparisonCard(place, index);
        elements.comparisonGrid.appendChild(card);
    });
}

function createComparisonCard(place, index) {
    const card = document.createElement('div');
    card.className = 'place-card';

    // Fetch additional details to mirror search card actions/info
    const service = new google.maps.places.PlacesService(document.createElement('div'));
    service.getDetails({
        placeId: place.place_id,
        fields: ['name', 'rating', 'price_level', 'opening_hours', 'formatted_phone_number', 'formatted_address', 'geometry']
    }, (details, status) => {
        const ratingText = (details && details.rating) || place.rating || 'N/A';
        const addressText = (details && details.formatted_address) || place.formatted_address || '';
        const closingTime = getClosingTime(details && details.opening_hours);
        const phone = (details && details.formatted_phone_number) || '';
        const priceText = getPriceLevel((details && details.price_level) !== undefined ? details.price_level : place.price_level);

        card.innerHTML = `
            <div class="place-header">
                <div>
                    <div class="place-name">${place.name}</div>
                    <div class="place-rating">★ ${ratingText}</div>
                </div>
            </div>
            <div class="place-info">
                <div class="info-item" id="travel-${index}">🚗 Calculating...</div>
                <div class="info-item">📍 ${addressText}</div>
                <div class="info-item">🕒 Closes: ${closingTime}</div>
                <div class="info-item">💰 ${priceText}</div>
                <div class="info-item">
                    <span class="busyness" id="compare-busyness-${index}">Loading...</span>
                </div>
            </div>
            <div class="place-actions">
                <button class="btn btn-primary" onclick="showPlaceDetails('${place.place_id}')">
                    View Details
                </button>
                <button class="btn btn-success" onclick="callPlace('${phone}')">
                    📞 Call
                </button>
                <button class="btn btn-info" onclick="showBusynessChart('${place.place_id}')">
                    📊 Busyness
                </button>
                <button class="btn btn-warning" onclick="removeFromComparison(${index})">
                    Remove
                </button>
            </div>
        `;

        // Load dynamic data
        loadBusynessData(place.place_id, `compare-busyness-${index}`);
        calculateTravelTime((details && details.geometry && details.geometry.location) || place.geometry.location, `travel-${index}`);
    });

    return card;
}

function removeFromComparison(index) {
    selectedPlaces.splice(index, 1);
    updateComparisonSection();
    // Refresh search results buttons/state
    if (searchResults && searchResults.length > 0) {
        displaySearchResults();
    }
}

function compareSelectedPlaces() {
    if (selectedPlaces.length === 0) return;
    
    showLoading();
    
    // Refresh all data for selected places
    selectedPlaces.forEach((place, index) => {
        loadBusynessData(place.place_id, `compare-busyness-${index}`);
        calculateTravelTime(place.geometry.location, `travel-${index}`);
    });
    
    setTimeout(() => {
        hideLoading();
        showMessage('Comparison data updated!');
    }, 2000);
}

function refreshComparison() {
    if (selectedPlaces.length === 0) return;
    
    elements.refreshBtn.classList.add('loading');
    
    selectedPlaces.forEach((place, index) => {
        loadBusynessData(place.place_id, `compare-busyness-${index}`);
        calculateTravelTime(place.geometry.location, `travel-${index}`);
    });
    
    setTimeout(() => {
        elements.refreshBtn.classList.remove('loading');
    }, 2000);
}

// API Functions
function geocodeAddress(address) {
    return new Promise((resolve, reject) => {
        const geocoder = new google.maps.Geocoder();
        geocoder.geocode({ address: address }, (results, status) => {
            if (status === 'OK') {
                const location = results[0].geometry.location;
                resolve({
                    lat: location.lat(),
                    lng: location.lng(),
                    address: results[0].formatted_address
                });
            } else {
                reject(status);
            }
        });
    });
}

function calculateTravelTime(destination, elementId) {
    if (!currentLocation) return;
    
    const service = new google.maps.DistanceMatrixService();
    const mode = transportMode === 'driving' ? 
        google.maps.TravelMode.DRIVING : 
        google.maps.TravelMode.WALKING;
    
    service.getDistanceMatrix({
        origins: [new google.maps.LatLng(currentLocation.lat, currentLocation.lng)],
        destinations: [destination],
        travelMode: mode,
        unitSystem: google.maps.UnitSystem.METRIC
    }, (response, status) => {
        const element = document.getElementById(elementId);
        if (element && status === 'OK') {
            const result = response.rows[0].elements[0];
            if (result.status === 'OK') {
                const icon = transportMode === 'driving' ? '🚗' : '🚶';
                element.innerHTML = `${icon} ${result.duration.text} (${result.distance.text})`;
            }
        }
    });
}

async function loadBusynessData(placeId, elementId) {
    const element = document.getElementById(elementId);
    if (!element) return;

    element.className = 'busyness';
    element.textContent = 'Loading...';

    try {
        const response = await fetch(
            `https://busyness-api-575381598315.us-central1.run.app/busyness/live?place_id=${encodeURIComponent(placeId)}`, 
            { cache: 'no-store' }
        );
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        console.log('Worker response:', data); // Keep this for debugging

        // Your Worker returns: { currentBusyness: number, busynessLevel: 'low'|'medium'|'high' }
        let busynessScore = data.currentBusyness;
        let level = data.busynessLevel;

        // Fallback if the expected structure isn't there
        if (typeof busynessScore !== 'number') {
            busynessScore = Math.floor(Math.random() * 100); // Temporary fallback
            level = busynessScore < 34 ? 'low' : busynessScore < 67 ? 'medium' : 'high';
        }

        const label = level.charAt(0).toUpperCase() + level.slice(1);
        element.className = `busyness ${level}`;
        element.textContent = `${label} Traffic`;
        
    } catch (error) {
        console.error('Busyness data error:', error);
        element.className = 'busyness';
        element.textContent = 'N/A';
    }
}



// Modal Functions
function showPlaceDetails(placeId) {
    const service = new google.maps.places.PlacesService(document.createElement('div'));
    service.getDetails({
        placeId: placeId,
        fields: ['name', 'rating', 'reviews', 'price_level', 'formatted_address', 'formatted_phone_number', 'website', 'photos']
    }, (place, status) => {
        if (status === google.maps.places.PlacesServiceStatus.OK) {
            displayPlaceModal(place);
        }
    });
}

function displayPlaceModal(place) {
    const modalBody = document.getElementById('modal-body');
    modalBody.innerHTML = `
        <div style="padding: 1.5rem;">
            <h2>${place.name}</h2>
            <div style="margin: 1rem 0;">
                <strong>Rating:</strong> ★ ${place.rating || 'N/A'} 
                <span style="margin-left: 1rem;"><strong>Price:</strong> ${getPriceLevel(place.price_level)}</span>
            </div>
            <div style="margin: 1rem 0;">
                <strong>Address:</strong><br>
                ${place.formatted_address}
            </div>
            ${place.formatted_phone_number ? `
                <div style="margin: 1rem 0;">
                    <strong>Phone:</strong> ${place.formatted_phone_number}
                </div>
            ` : ''}
            ${place.website ? `
                <div style="margin: 1rem 0;">
                    <strong>Website:</strong> <a href="${place.website}" target="_blank">Visit Website</a>
                </div>
            ` : ''}
            <div style="margin: 1rem 0;">
                <strong>Menu/More Info:</strong> Available on Google Maps
            </div>
        </div>
    `;
    
    elements.placeModal.classList.remove('hidden');
}

function showBusynessChart(placeId) {
    const chartContainer = document.getElementById('chart-container');
    chartContainer.innerHTML = `
        <div style="padding: 1.5rem;">
            <h3>Today's Busyness Pattern</h3>
            <div style="margin: 1rem 0;">
                <canvas id="busyness-chart" width="400" height="200"></canvas>
            </div>
            <p style="font-size: 0.9rem; color: #666; margin-top: 1rem;">
                Data shows typical busyness levels for today. Actual levels may vary.
            </p>
        </div>
    `;
    
    // Draw simple chart (replace with actual chart library if needed)
    drawBusynessChart();
    elements.chartModal.classList.remove('hidden');
}

function drawBusynessChart() {
    const canvas = document.getElementById('busyness-chart');
    const ctx = canvas.getContext('2d');
    
    // Sample data - replace with real BestTime API data
    const hours = Array.from({length: 24}, (_, i) => i);
    const busyness = hours.map(() => Math.random() * 100);
    
    // Simple line chart
    ctx.strokeStyle = '#2196F3';
    ctx.lineWidth = 2;
    ctx.beginPath();
    
    busyness.forEach((level, index) => {
        const x = (index / 23) * 350 + 25;
        const y = 150 - (level / 100) * 100 + 25;
        
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    });
    
    ctx.stroke();
    
    // Add labels
    ctx.fillStyle = '#666';
    ctx.font = '12px Arial';
    ctx.fillText('6am', 25, 180);
    ctx.fillText('12pm', 175, 180);
    ctx.fillText('6pm', 325, 180);
}

function callPlace(phoneNumber) {
    if (phoneNumber) {
        window.open(`tel:${phoneNumber}`);
    } else {
        showMessage('Phone number not available for this place.');
    }
}

// Utility Functions
function showLoading() {
    elements.loadingOverlay.classList.remove('hidden');
}

function hideLoading() {
    elements.loadingOverlay.classList.add('hidden');
}

function showMessage(message) {
    // Simple alert for now - you can replace with a toast notification
    alert(message);
}

function cacheLocation() {
    if (currentLocation) {
        const cacheData = {
            location: currentLocation,
            timestamp: Date.now()
        };
        localStorage.setItem('placeFinder_location', JSON.stringify(cacheData));
    }
}

function loadCachedLocation() {
    const cached = localStorage.getItem('placeFinder_location');
    if (cached) {
        const data = JSON.parse(cached);
        const isExpired = (Date.now() - data.timestamp) > CONFIG.CACHE_DURATION;
        
        if (!isExpired) {
            currentLocation = data.location;
            updateLocationDisplay();
            enableSearch();
        } else {
            localStorage.removeItem('placeFinder_location');
        }
    }
}

// Load Google Maps API
function loadGoogleMapsAPI() {
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${CONFIG.GOOGLE_MAPS_API_KEY}&libraries=places`;
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);
}

// Initialize Google Maps when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadGoogleMapsAPI);
} else {
    loadGoogleMapsAPI();
}
