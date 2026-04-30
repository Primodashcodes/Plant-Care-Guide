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
let activeLogPlantId = null;

// =========================================================
// LOCAL STORAGE HELPERS
// =========================================================
function getHistory() {
  try { return JSON.parse(localStorage.getItem('plantHistory') || '[]'); } catch { return []; }
}
function saveHistory(h) { localStorage.setItem('plantHistory', JSON.stringify(h)); }
function getProgress() {
  try { return JSON.parse(localStorage.getItem('plantProgress') || '[]'); } catch { return []; }
}
function saveProgress(p) { localStorage.setItem('plantProgress', JSON.stringify(p)); }

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

  // Desktop nav
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  const pages = ['browse', 'scan', 'garden', 'location', 'about'];
  const idx = pages.indexOf(page);
  if (idx >= 0) document.querySelectorAll('.nav-btn')[idx]?.classList.add('active');

  // Mobile nav
  document.querySelectorAll('.mobile-nav-btn').forEach(b => {
    const bp = b.dataset.page;
    const isActive = bp === page ||
      (page === 'garden' && (bp === 'history' || bp === 'progress'));
    b.classList.toggle('active', isActive);
  });
  const camBtn = document.querySelector('.mnav-cam-btn');
  if (camBtn) camBtn.classList.toggle('mnav-cam-active', page === 'scan');

  const hero = document.getElementById('heroSection');
  if (hero) hero.style.display = page === 'browse' ? '' : 'none';

  if (page === 'scan' && !cameraStream) setTimeout(() => toggleCamera(), 300);
  if (page !== 'scan' && cameraStream) stopCamera();
  if (page === 'garden') { renderHistory(); renderProgress(); }
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

    // Build health status badges if Gemini detected conditions
    let healthHtml = '';
    if (result.health && result.health.length > 0) {
      const badgeMap = {
        'Healthy':            { icon: '✅', color: '#40916c', bg: '#d8f3dc' },
        'Needs Water':        { icon: '💧', color: '#1e6091', bg: '#d0e8f5' },
        'Overwatered':        { icon: '🌊', color: '#0077b6', bg: '#caf0f8' },
        'Needs More Sunlight':{ icon: '☀️', color: '#b5560a', bg: '#ffe8cc' },
        'Too Much Sun':       { icon: '🔆', color: '#c9730a', bg: '#fff3cd' },
        'Nutrient Deficiency':{ icon: '🌿', color: '#5a6b2a', bg: '#e9f5d0' },
        'Pest Detected':      { icon: '🐛', color: '#7b2d00', bg: '#ffe0cc' },
        'Disease Detected':   { icon: '🦠', color: '#8b0000', bg: '#ffe0e0' },
        'Wilting':            { icon: '😔', color: '#6b4c11', bg: '#f5e6cc' },
        'Root Bound':         { icon: '🪴', color: '#5c4b1e', bg: '#f0e6d0' },
      };
      const badges = result.health.map(h => {
        const style = badgeMap[h] || { icon: '🔍', color: '#555', bg: '#eee' };
        return `<span class="health-badge" style="background:${style.bg};color:${style.color};">${style.icon} ${h}</span>`;
      }).join('');
      healthHtml = `<div class="health-status-row"><strong>🩺 Plant Health:</strong><div class="health-badges">${badges}</div></div>`;
      if (result.health_detail) {
        healthHtml += `<div class="health-detail-box">${result.health_detail}</div>`;
      }
    }

    document.getElementById('resultBody').innerHTML = `
      ${healthHtml}
      <p>${result.description}</p>
      <p><strong>💧 Water:</strong> ${result.water}</p>
      <p><strong>☀️ Sunlight:</strong> ${result.sunlight}</p>
      <p><strong>🪴 Soil:</strong> ${result.soil}</p>
      <p><strong>💡 Care Tip:</strong> ${result.care_tip}</p>
      <p><strong>✨ Fun Fact:</strong> ${result.interesting_fact}</p>
    `;

    // ── Save to identification history ──
    const histEntry = {
      id: Date.now(),
      name: result.name,
      scientific: result.scientific,
      emoji: result.emoji || '🌿',
      description: result.description,
      water: result.water,
      sunlight: result.sunlight,
      soil: result.soil,
      care_tip: result.care_tip,
      interesting_fact: result.interesting_fact,
      health: result.health || [],
      health_detail: result.health_detail || '',
      image: '',
      date: new Date().toISOString()
    };
    const hist = getHistory();
    hist.unshift(histEntry);
    if (hist.length > 50) hist.pop();
    saveHistory(hist);

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
// AUDIO PRONUNCIATION
// =========================================================
function speakPlantName() {
  const name       = document.getElementById('resultName').textContent;
  const scientific = document.getElementById('resultScientific').textContent;
  if (!name) return;

  if (!window.speechSynthesis) {
    alert('Text-to-speech is not supported in your browser.');
    return;
  }

  window.speechSynthesis.cancel();

  const btn = document.getElementById('audioBtn');
  btn.classList.add('speaking');

  // Speak common name then scientific name
  const utter1 = new SpeechSynthesisUtterance(name);
  utter1.lang  = 'en-US';
  utter1.rate  = 0.85;
  utter1.pitch = 1;

  const utter2 = new SpeechSynthesisUtterance(scientific);
  utter2.lang  = 'en-US';
  utter2.rate  = 0.75;
  utter2.pitch = 0.95;

  utter2.onend = () => btn.classList.remove('speaking');
  utter1.onend = () => window.speechSynthesis.speak(utter2);

  window.speechSynthesis.speak(utter1);
}

// Also allow pronunciation from modal (plant browse cards)
function speakText(text, scientific = '') {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const u1 = new SpeechSynthesisUtterance(text);
  u1.lang = 'en-US'; u1.rate = 0.85;
  if (scientific) {
    const u2 = new SpeechSynthesisUtterance(scientific);
    u2.lang = 'en-US'; u2.rate = 0.75;
    u1.onend = () => window.speechSynthesis.speak(u2);
  }
  window.speechSynthesis.speak(u1);
}

// =========================================================
// GARDEN TAB SWITCHER
// =========================================================
function switchGardenTab(tab) {
  document.querySelectorAll('.garden-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.garden-panel').forEach(p => p.classList.remove('active'));
  document.getElementById('tab-' + tab).classList.add('active');
  document.getElementById('garden-panel-' + tab).classList.add('active');
  if (tab === 'history') renderHistory();
  if (tab === 'progress') renderProgress();
}

// Pre-fill progress form from a history entry and switch to tracker tab
function trackFromHistory(name) {
  document.getElementById('progressPlantName').value = name;
  document.getElementById('progressStartDate').value = new Date().toISOString().split('T')[0];
  document.getElementById('progressNotes').value = '';
  switchGardenTab('progress');
  document.getElementById('progressPlantName').focus();
}

// =========================================================
// IDENTIFICATION HISTORY
// =========================================================
function renderHistory() {
  const hist = getHistory();
  const empty = document.getElementById('historyEmpty');
  const list  = document.getElementById('historyList');

  if (hist.length === 0) {
    empty.style.display = 'block';
    list.innerHTML = '';
    return;
  }
  empty.style.display = 'none';

  list.innerHTML = hist.map(h => {
    const date  = new Date(h.date).toLocaleString();
    const thumb = h.image
      ? `<img src="${h.image}" alt="${h.name}" class="hist-thumb" />`
      : `<div class="hist-thumb hist-thumb-emoji">${h.emoji}</div>`;
    const safeName = h.name.replace(/'/g, "\\'");
    const safeSci  = (h.scientific || '').replace(/'/g, "\\'");

    return `
      <div class="hist-card">
        ${thumb}
        <div class="hist-body">
          <div class="hist-name">
            ${h.name}
            <button class="hist-audio-btn" onclick="speakText('${safeName}','${safeSci}')" title="Pronounce">🔊</button>
          </div>
          <div class="hist-scientific">${h.scientific || ''}</div>
          <div class="hist-date">🕓 ${date}</div>
          <div class="hist-snippet">${h.description ? h.description.substring(0, 100) + '…' : ''}</div>
          ${h.health && h.health.length ? `<div class="hist-health-row">${h.health.map(hh => `<span class="hist-health-tag">${hh}</span>`).join('')}</div>` : ''}
          <button class="track-from-hist-btn" onclick="trackFromHistory('${safeName}')">📈 Track This Plant</button>
        </div>
        <button class="hist-delete-btn" onclick="deleteHistory(${h.id})" title="Remove">✕</button>
      </div>
    `;
  }).join('');
}

function deleteHistory(id) {
  const hist = getHistory().filter(h => h.id !== id);
  saveHistory(hist);
  renderHistory();
}

function clearHistory() {
  if (!confirm('Clear all identification history?')) return;
  saveHistory([]);
  renderHistory();
}

// =========================================================
// PLANT PROGRESS TRACKER
// =========================================================
function addProgressPlant() {
  const name  = document.getElementById('progressPlantName').value.trim();
  const start = document.getElementById('progressStartDate').value;
  const notes = document.getElementById('progressNotes').value.trim();

  if (!name) { alert('Please enter a plant name.'); return; }

  const prog = getProgress();
  prog.unshift({
    id: Date.now(),
    name,
    startDate: start || new Date().toISOString().split('T')[0],
    notes,
    logs: []
  });
  saveProgress(prog);

  document.getElementById('progressPlantName').value = '';
  document.getElementById('progressStartDate').value = '';
  document.getElementById('progressNotes').value = '';

  renderProgress();
}

function renderProgress() {
  const prog  = getProgress();
  const empty = document.getElementById('progressEmpty');
  const list  = document.getElementById('progressList');

  if (prog.length === 0) {
    empty.style.display = 'block';
    list.innerHTML = '';
    return;
  }
  empty.style.display = 'none';

  list.innerHTML = prog.map(p => {
    const daysSince = Math.floor((Date.now() - new Date(p.startDate)) / 86400000);
    const lastLog   = p.logs.length ? p.logs[p.logs.length - 1] : null;
    const statusDot = lastLog ? statusColor(lastLog.status) : '#aaa';

    const logsHtml = p.logs.length
      ? p.logs.slice(-5).reverse().map(l => `
          <div class="prog-log-entry">
            <span class="prog-log-status" style="background:${statusColor(l.status)}">${l.status}</span>
            <span class="prog-log-date">${l.date}</span>
            <span class="prog-log-note">${l.note}</span>
          </div>`).join('')
      : '<div class="prog-no-logs">No entries yet — add your first log!</div>';

    return `
      <div class="prog-card">
        <div class="prog-card-header">
          <div>
            <div class="prog-plant-name">
              🌿 ${p.name}
              <button class="hist-audio-btn" onclick="speakText('${p.name.replace(/'/g,"\\'")}') " title="Pronounce">🔊</button>
            </div>
            <div class="prog-plant-meta">Started ${p.startDate} · ${daysSince} day${daysSince !== 1 ? 's' : ''} growing</div>
          </div>
          <div style="display:flex;gap:8px;align-items:center;">
            <span class="prog-status-dot" style="background:${statusDot}"></span>
            <button class="prog-add-log-btn" onclick="openLogModal(${p.id})">+ Log</button>
            <button class="prog-delete-btn" onclick="deleteProgress(${p.id})">🗑</button>
          </div>
        </div>
        ${p.notes ? `<div class="prog-initial-notes">📝 ${p.notes}</div>` : ''}
        <div class="prog-logs">${logsHtml}</div>
      </div>
    `;
  }).join('');
}

function statusColor(s) {
  const map = { 'Healthy':'#40916c','Growing':'#52b788','Flowering':'#e07bbb','Needs Water':'#f4a261','Issue Detected':'#e05c5c' };
  return map[s] || '#aaa';
}

function openLogModal(plantId) {
  activeLogPlantId = plantId;
  const prog = getProgress();
  const plant = prog.find(p => p.id === plantId);
  document.getElementById('logPlantLabel').textContent = plant ? plant.name : '';
  document.getElementById('logDate').value = new Date().toISOString().split('T')[0];
  document.getElementById('logNote').value = '';
  document.getElementById('logStatus').value = 'Healthy';
  document.getElementById('logModalOverlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeLogModal(e) {
  if (e && e.target !== document.getElementById('logModalOverlay')) return;
  document.getElementById('logModalOverlay').classList.remove('open');
  document.body.style.overflow = '';
}

function saveLogEntry() {
  const date   = document.getElementById('logDate').value;
  const note   = document.getElementById('logNote').value.trim();
  const status = document.getElementById('logStatus').value;

  if (!note) { alert('Please write a note about the plant.'); return; }

  const prog  = getProgress();
  const plant = prog.find(p => p.id === activeLogPlantId);
  if (!plant) return;

  plant.logs.push({ date: date || new Date().toISOString().split('T')[0], note, status });
  saveProgress(prog);
  closeLogModal();
  renderProgress();
}

function deleteProgress(id) {
  if (!confirm('Remove this plant from the tracker?')) return;
  saveProgress(getProgress().filter(p => p.id !== id));
  renderProgress();
}

function toggleMoreMenu() {
  const popup = document.getElementById('mnavMorePopup');
  popup.classList.toggle('open');
}
function closeMoreMenu() {
  document.getElementById('mnavMorePopup').classList.remove('open');
}
// Close more menu when tapping outside
document.addEventListener('click', e => {
  const popup = document.getElementById('mnavMorePopup');
  if (popup && popup.classList.contains('open')) {
    if (!popup.contains(e.target) && !e.target.closest('.mobile-nav-btn[data-page="about"]')) {
      closeMoreMenu();
    }
  }
});

// =========================================================
// START
// =========================================================
document.addEventListener('DOMContentLoaded', init);
