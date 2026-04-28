const GEMINI_MODEL    = 'gemini-2.0-flash';
const GEMINI_ENDPOINT = '/api/identify';

// =========================================================
// STATE
// =========================================================
let plants           = [];
let currentFilter    = 'All';
let currentCatFilter = 'All';
let cameraStream     = null;
let capturedB64      = null;
let currentPage      = 'browse';

// =========================================================
// INIT
// =========================================================
async function init() {
  try {
    const res = await fetch('plants.json');
    if (!res.ok) throw new Error('fetch failed');
    plants = await res.json();
  } catch {
    plants = window.PLANTS_DATA || [];
  }
  renderPlants(plants);
  document.getElementById('totalCount').textContent = plants.length;
  document.getElementById('shownCount').textContent = plants.length;
}

// =========================================================
// PAGE NAVIGATION
// =========================================================
function showPage(page) {
  currentPage = page;

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-' + page).classList.add('active');

  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.mobile-nav-btn').forEach(b => b.classList.remove('active'));

  const pages = ['browse', 'scan', 'location', 'about'];
  const idx = pages.indexOf(page);
  if (idx >= 0) {
    document.querySelectorAll('.nav-btn')[idx]?.classList.add('active');
    document.querySelectorAll('.mobile-nav-btn')[idx]?.classList.add('active');
  }

  const hero = document.getElementById('heroSection');
  if (hero) hero.style.display = page === 'browse' ? '' : 'none';

  // Auto-open camera when navigating to scan page
  if (page === 'scan' && !cameraStream) {
    setTimeout(() => toggleCamera(), 300);
  }

  // Stop camera when leaving scan page
  if (page !== 'scan' && cameraStream) stopCamera();
}

// =========================================================
// PLANT BROWSE
// =========================================================
function renderPlants(list) {
  const grid = document.getElementById('plantGrid');
  const noResults = document.getElementById('noResults');
  document.getElementById('shownCount').textContent = list.length;

  if (list.length === 0) {
    grid.innerHTML = '';
    noResults.classList.add('visible');
    return;
  }
  noResults.classList.remove('visible');

  grid.innerHTML = list.map(p => `
    <div class="plant-card" onclick="openModal(${p.id})">
      <div class="plant-card-img-wrap">
        <img class="plant-card-img" src="${p.image || ''}" alt="${p.name}"
          onerror="this.style.display='none';this.nextElementSibling.style.display='flex'" loading="lazy" />
        <div class="plant-card-img-fallback" style="display:none">
          <span style="font-size:3rem">${p.emoji}</span>
        </div>
        <span class="difficulty-badge ${p.difficulty}">${p.difficulty}</span>
      </div>
      <div class="plant-card-body">
        <div class="plant-card-name">${p.name}</div>
        <div class="plant-card-scientific">${p.scientific}</div>
        <span class="plant-card-cat">${p.category}</span>
        <div class="plant-card-desc">${p.description}</div>
        <div class="plant-card-location">📍 ${p.location}</div>
      </div>
    </div>
  `).join('');
}

function filterPlants() {
  const q = document.getElementById('searchInput').value.toLowerCase().trim();
  const filtered = plants.filter(p => {
    const matchSearch = !q ||
      p.name.toLowerCase().includes(q) ||
      p.scientific.toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q) ||
      p.tags.some(t => t.toLowerCase().includes(q)) ||
      p.location.toLowerCase().includes(q);
    const matchDiff = currentFilter === 'All' || p.difficulty === currentFilter;
    const matchCat  = currentCatFilter === 'All' ||
      p.category === currentCatFilter ||
      (currentCatFilter === 'Indoor' && p.tags.includes('indoor'));
    return matchSearch && matchDiff && matchCat;
  });
  renderPlants(filtered);
}

function setFilter(val, el) {
  currentFilter = val;
  currentCatFilter = 'All';
  document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  filterPlants();
}

function setCatFilter(val, el) {
  currentCatFilter = val;
  currentFilter = 'All';
  document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  filterPlants();
}

// =========================================================
// MODAL
// =========================================================
function openModal(id) {
  const p = plants.find(x => x.id === id);
  if (!p) return;

  const modalHdr = document.getElementById('modalEmoji');
  if (p.image) {
    modalHdr.innerHTML = `<img src="${p.image}" alt="${p.name}" style="width:100%;height:100%;object-fit:cover;"
      onerror="this.parentElement.innerHTML='<span style=font-size:5rem>${p.emoji}</span>'" />`;
  } else {
    modalHdr.textContent = p.emoji;
  }
  document.getElementById('modalName').textContent       = p.name;
  document.getElementById('modalScientific').textContent = p.scientific;
  document.getElementById('modalDesc').textContent       = p.description;

  document.getElementById('modalBadges').innerHTML = `
    <span class="plant-card-cat">${p.category}</span>
    <span class="difficulty-badge ${p.difficulty}" style="position:static;">${p.difficulty}</span>
    ${p.climate.map(c => `<span class="climate-tag">🌍 ${c}</span>`).join('')}
  `;

  const icons = { water:'💧', sunlight:'☀️', soil:'🪴', fertilizer:'🌱', temperature:'🌡️' };
  document.getElementById('modalCareGrid').innerHTML = Object.entries(p.care).map(([k, v]) => `
    <div class="care-item">
      <div class="care-item-label">${icons[k] || '•'} ${k}</div>
      <div class="care-item-value">${v}</div>
    </div>
  `).join('');

  document.getElementById('modalTags').innerHTML = p.tags.map(t => `<span class="tag">#${t}</span>`).join('');
  document.getElementById('modalOverlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeModal(e) {
  if (e && e.target !== document.getElementById('modalOverlay')) return;
  document.getElementById('modalOverlay').classList.remove('open');
  document.body.style.overflow = '';
}

// =========================================================
// CAMERA
// =========================================================
async function toggleCamera() {
  if (cameraStream) {
    stopCamera();
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
    });
    cameraStream = stream;

    const video = document.getElementById('liveVideo');
    video.srcObject = stream;
    video.style.display = 'block';

    document.getElementById('capturedImg').style.display  = 'none';
    document.getElementById('camPlaceholder').style.display = 'none';
    document.getElementById('camOverlay').style.display   = 'flex';
    document.getElementById('camViewfinder').classList.add('live');

    resetScanResult();
  } catch (err) {
    alert('Camera access denied. Please allow camera permission or use the gallery button to upload an image.\n\nError: ' + err.message);
  }
}

function stopCamera() {
  if (cameraStream) {
    cameraStream.getTracks().forEach(t => t.stop());
    cameraStream = null;
  }
  const video = document.getElementById('liveVideo');
  video.srcObject = null;
  video.style.display = 'none';

  document.getElementById('camOverlay').style.display = 'none';
  document.getElementById('camViewfinder').classList.remove('live');

  // Show placeholder only if no captured image
  const img = document.getElementById('capturedImg');
  if (!img.src || img.style.display === 'none') {
    document.getElementById('camPlaceholder').style.display = 'flex';
  }
}

// Shutter button: if camera live → snap; if not → open camera
function shutterPress() {
  if (cameraStream) {
    snapPhoto();
  } else {
    toggleCamera();
  }
}

function snapPhoto() {
  const video  = document.getElementById('liveVideo');
  const canvas = document.getElementById('snapCanvas');
  canvas.width  = video.videoWidth  || 640;
  canvas.height = video.videoHeight || 480;
  canvas.getContext('2d').drawImage(video, 0, 0);

  const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
  capturedB64 = dataUrl.split(',')[1];

  const img = document.getElementById('capturedImg');
  img.src = dataUrl;
  img.style.display = 'block';
  video.style.display = 'none';
  document.getElementById('camOverlay').style.display = 'none';

  stopCamera();
  callGemini(capturedB64, 'image/jpeg');
}

function handleFileUpload(e) {
  const file = e.target.files[0];
  if (!file) return;

  const mime = file.type || 'image/jpeg';
  const reader = new FileReader();
  reader.onload = ev => {
    const dataUrl = ev.target.result;
    capturedB64 = dataUrl.split(',')[1];

    const img = document.getElementById('capturedImg');
    img.src = dataUrl;
    img.style.display = 'block';

    document.getElementById('camPlaceholder').style.display = 'none';
    document.getElementById('liveVideo').style.display      = 'none';
    document.getElementById('camOverlay').style.display     = 'none';

    stopCamera();
    callGemini(capturedB64, mime);
  };
  reader.readAsDataURL(file);
  e.target.value = '';
}

// =========================================================
// GEMINI AI
// =========================================================
function resetScanResult() {
  document.getElementById('geminiLoading').classList.remove('visible');
  document.getElementById('geminiResult').classList.remove('visible');
  document.getElementById('geminiNotFound').classList.remove('visible');
  document.getElementById('dbMatchBanner').classList.remove('visible');
}

async function callGemini(base64, mimeType) {
  resetScanResult();
  document.getElementById('geminiLoading').classList.add('visible');

  try {
    const res = await fetch(GEMINI_ENDPOINT, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ base64, mimeType })
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody?.error?.message || `HTTP ${res.status}`);
    }

    const data    = await res.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    if (!rawText) throw new Error('Empty response from Gemini. Try a clearer photo.');

    const clean = rawText.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

    let result;
    try {
      result = JSON.parse(clean);
    } catch {
      const jsonMatch = clean.match(/\{[\s\S]*\}/);
      if (jsonMatch) result = JSON.parse(jsonMatch[0]);
      else throw new Error('Gemini returned unreadable format. Please try again.');
    }

    document.getElementById('geminiLoading').classList.remove('visible');

    if (!result.found) {
      document.getElementById('geminiNotFound').classList.add('visible');
      document.getElementById('notFoundMsg').textContent =
        result.reason || 'Could not identify the plant. Try a clearer, closer photo.';
      return;
    }

    document.getElementById('geminiResult').classList.add('visible');
    document.getElementById('resultEmoji').textContent      = result.emoji || '🌿';
    document.getElementById('resultName').textContent       = result.name;
    document.getElementById('resultScientific').textContent = result.scientific;
    document.getElementById('resultBody').innerHTML = `
      <p>${result.description}</p>
      <p><strong>💧 Water:</strong> ${result.water}</p>
      <p><strong>☀️ Sunlight:</strong> ${result.sunlight}</p>
      <p><strong>🪴 Soil:</strong> ${result.soil}</p>
      <p><strong>💡 Care Tip:</strong> ${result.care_tip}</p>
      <p><strong>✨ Fun Fact:</strong> ${result.interesting_fact}</p>
    `;

    const q  = result.name.toLowerCase();
    const qs = (result.scientific || '').toLowerCase().split(' ')[0];
    const dbMatch = plants.find(p =>
      p.name.toLowerCase().includes(q) ||
      q.includes(p.name.toLowerCase()) ||
      (qs && p.scientific.toLowerCase().includes(qs))
    );

    if (dbMatch) {
      document.getElementById('dbMatchBanner').classList.add('visible');
      document.getElementById('dbMatchDesc').textContent =
        `"${dbMatch.name}" is in our Plant Directory! Tap below for the full care guide.`;
      document.getElementById('dbMatchBtn').onclick = () => {
        showPage('browse');
        setTimeout(() => openModal(dbMatch.id), 150);
      };
    }

  } catch (err) {
    document.getElementById('geminiLoading').classList.remove('visible');
    document.getElementById('geminiNotFound').classList.add('visible');
    document.getElementById('notFoundMsg').textContent = '❌ ' + err.message;
  }
}

// =========================================================
// GEOLOCATION
// =========================================================
function getLocation() {
  if (!navigator.geolocation) {
    document.getElementById('locationStatus').textContent = '❌ Geolocation is not supported by your browser.';
    return;
  }
  document.getElementById('locationStatus').textContent = '🔄 Detecting your location…';

  navigator.geolocation.getCurrentPosition(
    pos => {
      const { latitude: lat, longitude: lon } = pos.coords;
      const climate = getClimateZone(lat, lon);

      document.getElementById('locationStatus').textContent = '✅ Location detected!';
      document.getElementById('locCoords').textContent  = `${lat.toFixed(4)}°, ${lon.toFixed(4)}°`;
      document.getElementById('locRegion').textContent  = climate.region;
      document.getElementById('locClimate').textContent = climate.zone;
      document.getElementById('locationInfo').classList.add('visible');

      const suitable = plants.filter(p => p.climate.some(c => climate.matches.includes(c)));
      const top = suitable.slice(0, 12);

      document.getElementById('suggestedSection').style.display = 'block';
      document.getElementById('suggestedList').innerHTML = top.map(p => `
        <div class="suggested-item" onclick="showPage('browse'); setTimeout(() => openModal(${p.id}), 150)">
          <div class="suggested-item-img">
            <img src="${p.image || ''}" alt="${p.name}"
              style="width:100%;height:100%;object-fit:cover;border-radius:8px;"
              onerror="this.style.display='none';this.nextElementSibling.style.display='flex'" />
            <span style="display:none;font-size:1.5rem;align-items:center;justify-content:center;width:100%;height:100%">${p.emoji}</span>
          </div>
          <div>
            <div class="suggested-item-name">${p.name}</div>
            <div class="suggested-item-cat">${p.category} · ${p.difficulty}</div>
          </div>
        </div>
      `).join('');
    },
    err => {
      document.getElementById('locationStatus').textContent = '❌ ' + err.message;
    },
    { timeout: 10000, enableHighAccuracy: true }
  );
}

function getClimateZone(lat, lon) {
  if (lat >= 4 && lat <= 21 && lon >= 116 && lon <= 127)
    return { zone: 'Tropical 🌴', region: 'Philippines', matches: ['Tropical'] };
  const a = Math.abs(lat);
  if (a <= 10) return { zone: 'Tropical 🌴',       region: 'Equatorial',       matches: ['Tropical'] };
  if (a <= 25) return { zone: 'Subtropical 🌞',    region: 'Subtropical Belt',  matches: ['Tropical','Subtropical'] };
  if (a <= 35) return { zone: 'Warm Temperate 🌤', region: 'Warm Temperate',    matches: ['Subtropical','Mediterranean','Temperate'] };
  if (a <= 50) return { zone: 'Temperate 🌿',      region: 'Temperate Zone',    matches: ['Temperate','Mediterranean'] };
  if (a <= 60) return { zone: 'Cool Temperate ❄️', region: 'Cool Temperate',    matches: ['Temperate','Cold'] };
  return       { zone: 'Cold / Subarctic 🧊',      region: 'Cold Region',       matches: ['Cold'] };
}

// =========================================================
// START
// =========================================================
document.addEventListener('DOMContentLoaded', init);
