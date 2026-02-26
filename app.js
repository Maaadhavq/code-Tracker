/* ============================================================
   CodeTrack — Application Logic
   Data layer (localStorage), navigation, CRUD, charts, heatmap
   ============================================================ */

// ─── Data Layer ───
const DB_KEY = 'codetrack_data';

function defaultData() {
  return {
    problems: [],
    reminders: [],
    notes: [],
    settings: { name: '', email: '', dailyGoal: 3, interviewDate: '' },
    activityLog: {} // { 'YYYY-MM-DD': count }
  };
}

function loadData() {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (!raw) return defaultData();
    return { ...defaultData(), ...JSON.parse(raw) };
  } catch { return defaultData(); }
}

function saveData(data) {
  localStorage.setItem(DB_KEY, JSON.stringify(data));
}

let APP = loadData();

function uuid() {
  return crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// ─── Toast ───
function showToast(msg, type = 'success') {
  const c = document.getElementById('toastContainer');
  const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️';
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `<span>${icon}</span> ${msg}`;
  c.appendChild(t);
  setTimeout(() => t.remove(), 3100);
}

// ─── Navigation ───
let currentPage = 'dashboard';
let currentProblemId = null;

function navigateTo(page, skipPush) {
  document.querySelectorAll('.page').forEach(p => p.style.display = 'none');
  const el = document.getElementById('page-' + page);
  if (el) el.style.display = 'block';

  document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.page === page));
  currentPage = page;

  // Close all open modals
  document.querySelectorAll('.modal-overlay.active').forEach(m => m.classList.remove('active'));

  // Close sidebar on mobile
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').classList.remove('open');

  // Refresh page data
  if (page === 'dashboard') renderDashboard();
  else if (page === 'problems') renderProblemList();
  else if (page === 'analytics') renderAnalytics();
  else if (page === 'reminders') renderReminders();
  else if (page === 'notes') renderNotes();
  else if (page === 'settings') loadSettings();
  else if (page === 'detail') renderProblemDetail();
}

document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => navigateTo(btn.dataset.page));
});

// Sidebar toggle
function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebarOverlay').classList.toggle('open');
}
document.getElementById('menuBtn').addEventListener('click', toggleSidebar);
document.getElementById('sidebarOverlay').addEventListener('click', toggleSidebar);

// ─── Modal helpers ───
function openModal(id) {
  document.getElementById(id).classList.add('active');
}
function closeModal(id) {
  document.getElementById(id).classList.remove('active');
}

// ─── Tag Input ───
let currentTags = [];
const tagInput = document.getElementById('tagInput');
const tagContainer = document.getElementById('tagContainer');

tagInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault();
    const val = tagInput.value.trim().replace(',', '');
    if (val && !currentTags.includes(val)) {
      currentTags.push(val);
      renderTags();
    }
    tagInput.value = '';
  }
});

function renderTags() {
  tagContainer.querySelectorAll('.tag-badge').forEach(b => b.remove());
  currentTags.forEach((t, i) => {
    const badge = document.createElement('span');
    badge.className = 'tag-badge';
    badge.innerHTML = `${t} <span class="tag-remove" onclick="removeTag(${i})">×</span>`;
    tagContainer.insertBefore(badge, tagInput);
  });
}

function removeTag(i) {
  currentTags.splice(i, 1);
  renderTags();
}

// ─── Problem CRUD ───
function openAddProblem() {
  document.getElementById('problemModalTitle').textContent = 'Add Problem';
  document.getElementById('editProblemId').value = '';
  document.getElementById('problemForm').reset();
  currentTags = [];
  renderTags();
  openModal('problemModal');
}

function openEditProblem() {
  const p = APP.problems.find(x => x.id === currentProblemId);
  if (!p) return;
  document.getElementById('problemModalTitle').textContent = 'Edit Problem';
  document.getElementById('editProblemId').value = p.id;
  document.getElementById('probNum').value = p.leetcodeId || '';
  document.getElementById('probName').value = p.title;
  document.getElementById('probUrl').value = p.url || '';
  document.getElementById('probDiff').value = p.difficulty;
  document.getElementById('probStatus').value = p.status;
  document.getElementById('probNotes').value = p.notes || '';
  currentTags = [...(p.tags || [])];
  renderTags();
  openModal('problemModal');
}

function saveProblem(e) {
  e.preventDefault();
  const id = document.getElementById('editProblemId').value;
  const data = {
    leetcodeId: parseInt(document.getElementById('probNum').value) || null,
    title: document.getElementById('probName').value.trim(),
    url: document.getElementById('probUrl').value.trim(),
    difficulty: document.getElementById('probDiff').value,
    status: document.getElementById('probStatus').value,
    tags: [...currentTags],
    notes: document.getElementById('probNotes').value.trim()
  };

  if (id) {
    const idx = APP.problems.findIndex(x => x.id === id);
    if (idx >= 0) {
      APP.problems[idx] = { ...APP.problems[idx], ...data, updatedAt: new Date().toISOString() };
    }
    showToast('Problem updated');
  } else {
    APP.problems.push({
      id: uuid(),
      ...data,
      confidence: 0,
      attempts: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    showToast('Problem added');
  }

  saveData(APP);
  closeModal('problemModal');
  if (currentPage === 'problems') renderProblemList();
  else if (currentPage === 'detail') renderProblemDetail();
  else renderDashboard();
}

function deleteOpenProblem() {
  if (!confirm('Delete this problem?')) return;
  APP.problems = APP.problems.filter(p => p.id !== currentProblemId);
  saveData(APP);
  showToast('Problem deleted', 'error');
  navigateTo('problems');
}

// ─── Attempt CRUD ───
function openLogAttempt() {
  document.getElementById('attemptForm').reset();
  openModal('attemptModal');
}

function saveAttempt(e) {
  e.preventDefault();
  const p = APP.problems.find(x => x.id === currentProblemId);
  if (!p) return;

  const att = {
    id: uuid(),
    date: new Date().toISOString(),
    duration: parseInt(document.getElementById('attDuration').value),
    solved: document.getElementById('attResult').value === 'true',
    language: document.getElementById('attLang').value,
    notes: document.getElementById('attNotes').value.trim()
  };

  if (!p.attempts) p.attempts = [];
  p.attempts.push(att);
  p.totalAttempts = p.attempts.length;

  if (att.solved) {
    p.status = 'solved';
    if (!p.bestTime || att.duration < p.bestTime) p.bestTime = att.duration;
    // Log activity
    const today = new Date().toISOString().slice(0, 10);
    APP.activityLog[today] = (APP.activityLog[today] || 0) + 1;
  }

  p.updatedAt = new Date().toISOString();
  saveData(APP);
  closeModal('attemptModal');
  renderProblemDetail();
  showToast('Attempt logged');
}

function saveProblemNotes() {
  const p = APP.problems.find(x => x.id === currentProblemId);
  if (!p) return;
  p.notes = document.getElementById('detailNotes').value;
  p.updatedAt = new Date().toISOString();
  saveData(APP);
  showToast('Notes saved');
}

// ─── Reminder CRUD ───
function openAddReminder() {
  document.getElementById('reminderModalTitle').textContent = 'New Reminder';
  document.getElementById('editReminderId').value = '';
  document.getElementById('reminderForm').reset();
  // Default date to now + 1 hour
  const d = new Date(Date.now() + 3600000);
  document.getElementById('remDate').value = d.toISOString().slice(0, 16);
  openModal('reminderModal');
}

function saveReminder(e) {
  e.preventDefault();
  const id = document.getElementById('editReminderId').value;
  const data = {
    type: document.getElementById('remType').value,
    title: document.getElementById('remTitle').value.trim(),
    description: document.getElementById('remDesc').value.trim(),
    scheduledAt: document.getElementById('remDate').value,
    repeat: document.getElementById('remRepeat').value,
    isActive: true
  };

  if (id) {
    const idx = APP.reminders.findIndex(x => x.id === id);
    if (idx >= 0) APP.reminders[idx] = { ...APP.reminders[idx], ...data };
    showToast('Reminder updated');
  } else {
    APP.reminders.push({ id: uuid(), ...data });
    showToast('Reminder created');
  }

  saveData(APP);
  closeModal('reminderModal');
  renderReminders();
}

function toggleReminder(id) {
  const r = APP.reminders.find(x => x.id === id);
  if (r) { r.isActive = !r.isActive; saveData(APP); renderReminders(); }
}

function deleteReminder(id) {
  APP.reminders = APP.reminders.filter(r => r.id !== id);
  saveData(APP);
  renderReminders();
  showToast('Reminder deleted', 'error');
}

// ─── Note CRUD ───
function openAddNote() {
  document.getElementById('noteModalTitle').textContent = 'New Note';
  document.getElementById('editNoteId').value = '';
  document.getElementById('noteForm').reset();
  openModal('noteModal');
}

function openEditNote(id) {
  const n = APP.notes.find(x => x.id === id);
  if (!n) return;
  document.getElementById('noteModalTitle').textContent = 'Edit Note';
  document.getElementById('editNoteId').value = n.id;
  document.getElementById('noteTitle').value = n.title;
  document.getElementById('noteContent').value = n.content || '';
  document.getElementById('noteCheatSheet').checked = !!n.isCheatSheet;
  openModal('noteModal');
}

function saveNote(e) {
  e.preventDefault();
  const id = document.getElementById('editNoteId').value;
  const data = {
    title: document.getElementById('noteTitle').value.trim(),
    content: document.getElementById('noteContent').value,
    isCheatSheet: document.getElementById('noteCheatSheet').checked
  };

  if (id) {
    const idx = APP.notes.findIndex(x => x.id === id);
    if (idx >= 0) APP.notes[idx] = { ...APP.notes[idx], ...data, updatedAt: new Date().toISOString() };
    showToast('Note updated');
  } else {
    APP.notes.push({ id: uuid(), ...data, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    showToast('Note created');
  }

  saveData(APP);
  closeModal('noteModal');
  renderNotes();
}

function deleteNote(id) {
  if (!confirm('Delete this note?')) return;
  APP.notes = APP.notes.filter(n => n.id !== id);
  saveData(APP);
  renderNotes();
  showToast('Note deleted', 'error');
}

// ─── Settings ───
function loadSettings() {
  document.getElementById('settingsName').value = APP.settings.name || '';
  document.getElementById('settingsEmail').value = APP.settings.email || '';
  document.getElementById('settingsGoal').value = APP.settings.dailyGoal || 3;
  document.getElementById('settingsInterviewDate').value = APP.settings.interviewDate || '';
}

function saveSettings() {
  APP.settings.name = document.getElementById('settingsName').value.trim();
  APP.settings.email = document.getElementById('settingsEmail').value.trim();
  APP.settings.dailyGoal = parseInt(document.getElementById('settingsGoal').value) || 3;
  APP.settings.interviewDate = document.getElementById('settingsInterviewDate').value;
  saveData(APP);
  showToast('Settings saved');
}

function exportData() {
  const blob = new Blob([JSON.stringify(APP, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'codetrack_backup.json';
  a.click();
  showToast('Data exported');
}

function importData(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      APP = { ...defaultData(), ...JSON.parse(ev.target.result) };
      saveData(APP);
      showToast('Data imported');
      navigateTo('dashboard');
    } catch { showToast('Invalid file', 'error'); }
  };
  reader.readAsText(file);
}

function clearAllData() {
  if (!confirm('Are you sure? This will delete ALL your data.')) return;
  APP = defaultData();
  saveData(APP);
  showToast('All data cleared', 'error');
  navigateTo('dashboard');
}

// ─── Search & Filter State ───
let statusFilter = 'all';
let diffFilter = 'all';

function setStatusFilter(f) {
  statusFilter = f;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.toggle('active', b.dataset.filter === f));
  renderProblemList();
}

function setDiffFilter(f) {
  diffFilter = f;
  document.querySelectorAll('.filter-chip').forEach(c => c.classList.toggle('active', c.dataset.diff === f));
  renderProblemList();
}

document.getElementById('problemSearch').addEventListener('input', () => renderProblemList());
document.getElementById('noteSearch').addEventListener('input', () => renderNotes());

// ─── Render: Dashboard ───
function renderDashboard() {
  const solved = APP.problems.filter(p => p.status === 'solved' || p.status === 'revisited');
  const easy = solved.filter(p => p.difficulty === 'easy').length;
  const med = solved.filter(p => p.difficulty === 'medium').length;
  const hard = solved.filter(p => p.difficulty === 'hard').length;

  document.getElementById('totalSolved').textContent = solved.length;
  document.getElementById('easySolved').textContent = easy;
  document.getElementById('mediumSolved').textContent = med;
  document.getElementById('hardSolved').textContent = hard;

  // Streak
  const streak = calcStreak();
  document.getElementById('streakCount').textContent = streak.current + '-day streak';
  document.getElementById('longestStreak').textContent = streak.longest;

  // Today
  const today = new Date().toISOString().slice(0, 10);
  const todayCount = APP.activityLog[today] || 0;
  document.getElementById('todayCount').textContent = todayCount;
  document.getElementById('dailyGoal').textContent = APP.settings.dailyGoal || 3;

  // Readiness
  const readiness = calcReadiness();
  document.getElementById('readinessScore').textContent = readiness + '%';

  // Heatmap
  renderHeatmap();

  // Suggestions
  renderSuggestions();
}

function calcStreak() {
  let current = 0, longest = 0, d = new Date();
  // Check if today has activity — if not, start checking from yesterday
  const todayStr = d.toISOString().slice(0, 10);
  if (!APP.activityLog[todayStr]) {
    d.setDate(d.getDate() - 1);
  }
  while (true) {
    const key = d.toISOString().slice(0, 10);
    if (APP.activityLog[key] && APP.activityLog[key] > 0) {
      current++;
      d.setDate(d.getDate() - 1);
    } else break;
  }
  // Calculate longest from all activity
  const dates = Object.keys(APP.activityLog).sort();
  let tempStreak = 0;
  for (let i = 0; i < dates.length; i++) {
    if (i === 0 || dayDiff(dates[i - 1], dates[i]) === 1) {
      tempStreak++;
    } else {
      tempStreak = 1;
    }
    if (tempStreak > longest) longest = tempStreak;
  }
  if (current > longest) longest = current;
  return { current, longest };
}

function dayDiff(a, b) {
  return Math.round((new Date(b) - new Date(a)) / 86400000);
}

function calcReadiness() {
  const total = APP.problems.length;
  if (total === 0) return 0;
  const solved = APP.problems.filter(p => p.status === 'solved' || p.status === 'revisited').length;
  const medHard = APP.problems.filter(p => (p.status === 'solved' || p.status === 'revisited') && p.difficulty !== 'easy').length;
  const avgConf = APP.problems.reduce((s, p) => s + (p.confidence || 0), 0) / total;

  const topicCoverage = new Set(APP.problems.filter(p => p.status === 'solved').flatMap(p => p.tags || [])).size;
  const coreTopics = 10;
  const coverage = Math.min(topicCoverage / coreTopics, 1);

  const streak = calcStreak();
  const consistency = Math.min(streak.current / 14, 1);

  const diffBalance = total > 0 ? medHard / Math.max(solved, 1) : 0;

  return Math.round(
    coverage * 30 +
    Math.min(diffBalance, 1) * 25 +
    consistency * 20 +
    (avgConf / 5) * 15 +
    Math.min(solved / 50, 1) * 10
  );
}

// ─── Render: Heatmap ───
function renderHeatmap() {
  const grid = document.getElementById('heatmapGrid');
  grid.innerHTML = '';

  const today = new Date();
  const yearAgo = new Date(today);
  yearAgo.setFullYear(yearAgo.getFullYear() - 1);
  yearAgo.setDate(yearAgo.getDate() - yearAgo.getDay()); // start on Sunday

  const d = new Date(yearAgo);
  let weekDiv = null;
  let weekDay = 0;

  while (d <= today) {
    if (d.getDay() === 0) {
      weekDiv = document.createElement('div');
      weekDiv.className = 'heatmap-week';
      grid.appendChild(weekDiv);
    }

    const key = d.toISOString().slice(0, 10);
    const count = APP.activityLog[key] || 0;
    let level = 0;
    if (count >= 5) level = 4;
    else if (count >= 3) level = 3;
    else if (count >= 2) level = 2;
    else if (count >= 1) level = 1;

    const cell = document.createElement('div');
    cell.className = `heatmap-cell level-${level}`;
    cell.dataset.tooltip = `${key}: ${count} solved`;
    if (weekDiv) weekDiv.appendChild(cell);

    d.setDate(d.getDate() + 1);
  }

  document.getElementById('heatmapYear').textContent = today.getFullYear();
}

// ─── Render: Suggestions ───
function renderSuggestions() {
  const list = document.getElementById('suggestionList');
  const unsolved = APP.problems.filter(p => p.status === 'not_started' || p.status === 'attempted');

  if (unsolved.length === 0) {
    if (APP.problems.length === 0) {
      list.innerHTML = `<div class="empty-state"><div class="empty-icon">🎯</div><h3>Add problems to get suggestions</h3><p>We'll recommend problems based on your weak topics.</p></div>`;
    } else {
      list.innerHTML = `<div class="empty-state"><div class="empty-icon">🎉</div><h3>All problems solved!</h3><p>Add more problems to keep going.</p></div>`;
    }
    return;
  }

  // Simple suggestion: weakest tags first, then unsolved
  const tagStats = {};
  APP.problems.forEach(p => {
    (p.tags || []).forEach(t => {
      if (!tagStats[t]) tagStats[t] = { solved: 0, total: 0 };
      tagStats[t].total++;
      if (p.status === 'solved' || p.status === 'revisited') tagStats[t].solved++;
    });
  });

  // Score unsolved by tag weakness
  const scored = unsolved.map(p => {
    let score = 0;
    (p.tags || []).forEach(t => {
      if (tagStats[t]) score += (1 - tagStats[t].solved / tagStats[t].total);
    });
    return { ...p, score };
  }).sort((a, b) => b.score - a.score).slice(0, 5);

  list.innerHTML = scored.map(p => `
    <div class="suggestion-item" onclick="openProblemDetail('${p.id}')">
      <span class="diff-badge ${p.difficulty}">${p.difficulty}</span>
      <span class="prob-title">${p.leetcodeId ? '#' + p.leetcodeId + ' ' : ''}${p.title}</span>
      <span class="prob-tags">${(p.tags || []).join(', ')}</span>
    </div>
  `).join('');
}

function refreshSuggestions() {
  renderSuggestions();
  showToast('Suggestions refreshed', 'info');
}

// ─── Render: Problem List ───
function renderProblemList() {
  const list = document.getElementById('problemList');
  const query = document.getElementById('problemSearch').value.toLowerCase();

  let filtered = APP.problems;
  if (statusFilter !== 'all') filtered = filtered.filter(p => p.status === statusFilter);
  if (diffFilter !== 'all') filtered = filtered.filter(p => p.difficulty === diffFilter);
  if (query) filtered = filtered.filter(p =>
    p.title.toLowerCase().includes(query) ||
    (p.tags || []).some(t => t.toLowerCase().includes(query)) ||
    (p.leetcodeId && p.leetcodeId.toString().includes(query))
  );

  if (filtered.length === 0) {
    list.innerHTML = `<div class="empty-state"><div class="empty-icon">📚</div><h3>No problems found</h3><p>${APP.problems.length === 0 ? 'Start by adding your first problem.' : 'Try adjusting your filters.'}</p>${APP.problems.length === 0 ? '<button class="btn btn-primary" onclick="openAddProblem()">+ Add Problem</button>' : ''}</div>`;
    return;
  }

  filtered.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

  list.innerHTML = filtered.map(p => {
    const diffClass = p.difficulty === 'easy' ? 'color:var(--green)' : p.difficulty === 'medium' ? 'color:var(--yellow)' : 'color:var(--red)';
    const statusClass = 'status-' + p.status;
    const statusLabel = { not_started: 'New', attempted: 'Attempted', solved: 'Solved', revisited: 'Revisited' }[p.status] || p.status;
    return `
      <div class="problem-row" onclick="openProblemDetail('${p.id}')">
        <span class="prob-id">${p.leetcodeId ? '#' + p.leetcodeId : '—'}</span>
        <span class="prob-name">${p.title}</span>
        <span class="prob-diff" style="${diffClass}">${p.difficulty ? p.difficulty.charAt(0).toUpperCase() + p.difficulty.slice(1) : '—'}</span>
        <span class="prob-status ${statusClass}">${statusLabel}</span>
        <span class="prob-attempts">${(p.attempts || []).length} att.</span>
        <span class="prob-tags-cell">${(p.tags || []).join(', ')}</span>
      </div>`;
  }).join('');
}

// ─── Render: Problem Detail ───
function openProblemDetail(id) {
  currentProblemId = id;
  navigateTo('detail');
}

function renderProblemDetail() {
  const p = APP.problems.find(x => x.id === currentProblemId);
  if (!p) { navigateTo('problems'); return; }

  document.getElementById('detailTitle').textContent = p.title;
  document.getElementById('detailSub').textContent = `LeetCode ${p.leetcodeId ? '#' + p.leetcodeId : ''} • ${(p.difficulty || '').charAt(0).toUpperCase() + (p.difficulty || '').slice(1)}`;
  document.getElementById('detailProbId').textContent = p.leetcodeId ? '#' + p.leetcodeId : '';
  document.getElementById('detailProbName').textContent = p.title;

  document.getElementById('detailLink').href = p.url || '#';
  document.getElementById('detailLink').style.display = p.url ? '' : 'none';

  // Meta
  const diffColor = p.difficulty === 'easy' ? 'var(--green)' : p.difficulty === 'medium' ? 'var(--yellow)' : 'var(--red)';
  const statusLabel = { not_started: '⬜ Not Started', attempted: '🔄 Attempted', solved: '✅ Solved', revisited: '🔁 Revisited' }[p.status] || p.status;
  document.getElementById('detailMeta').innerHTML = `
    <span class="meta-item" style="color:${diffColor}">● ${(p.difficulty || '').charAt(0).toUpperCase() + (p.difficulty || '').slice(1)}</span>
    <span class="meta-item">${statusLabel}</span>
    ${(p.tags || []).map(t => `<span class="tag-badge">${t}</span>`).join('')}
  `;

  // Stats
  const attempts = p.attempts || [];
  const stars = [1, 2, 3, 4, 5].map(i => `<span class="star" onclick="setConfidence(${i})">${i <= (p.confidence || 0) ? '⭐' : '☆'}</span>`).join('');
  document.getElementById('detailStats').innerHTML = `
    <div class="detail-stat"><div class="ds-value">${attempts.length}</div><div class="ds-label">Attempts</div></div>
    <div class="detail-stat"><div class="ds-value">${p.bestTime ? p.bestTime + 'm' : '—'}</div><div class="ds-label">Best Time</div></div>
    <div class="detail-stat"><div class="ds-value">${attempts.length ? new Date(attempts[attempts.length - 1].date).toLocaleDateString() : '—'}</div><div class="ds-label">Last Attempt</div></div>
    <div class="detail-stat"><div class="confidence-stars">${stars}</div><div class="ds-label">Confidence</div></div>
  `;

  // Attempts
  const attList = document.getElementById('attemptList');
  if (attempts.length === 0) {
    attList.innerHTML = '<p style="color:var(--text-tertiary); text-align:center; padding:20px">No attempts yet. Click "Log Attempt" to start.</p>';
  } else {
    attList.innerHTML = [...attempts].reverse().map((a, i) => `
      <div class="attempt-entry">
        <span class="att-num">#${attempts.length - i}</span>
        <span class="att-date">${new Date(a.date).toLocaleDateString()}</span>
        <span class="att-time">${a.duration}min</span>
        <span class="att-result" style="color:${a.solved ? 'var(--green)' : 'var(--red)'}">${a.solved ? '✅' : '❌'}</span>
        <span style="color:var(--text-tertiary)">${a.language || ''}</span>
      </div>
    `).join('');
  }

  // Notes
  document.getElementById('detailNotes').value = p.notes || '';
}

function setConfidence(level) {
  const p = APP.problems.find(x => x.id === currentProblemId);
  if (!p) return;
  p.confidence = level;
  saveData(APP);
  renderProblemDetail();
}

// ─── Render: Analytics ───
function renderAnalytics() {
  renderDiffChart();
  renderTrendChart();
  renderTopicBars();
  renderReadinessGauge();
  renderStatusChart();
}

function renderDiffChart() {
  const canvas = document.getElementById('diffChart');
  const ctx = canvas.getContext('2d');
  canvas.width = canvas.parentElement.clientWidth;
  canvas.height = 240;

  const solved = APP.problems.filter(p => p.status === 'solved' || p.status === 'revisited');
  const counts = {
    easy: solved.filter(p => p.difficulty === 'easy').length,
    medium: solved.filter(p => p.difficulty === 'medium').length,
    hard: solved.filter(p => p.difficulty === 'hard').length
  };
  const total = counts.easy + counts.medium + counts.hard || 1;
  const colors = { easy: '#22c55e', medium: '#eab308', hard: '#ef4444' };

  // Draw donut
  const cx = canvas.width / 2, cy = 120, r = 80, rInner = 50;
  let startAngle = -Math.PI / 2;

  Object.entries(counts).forEach(([key, val]) => {
    const sliceAngle = (val / total) * 2 * Math.PI;
    ctx.beginPath();
    ctx.arc(cx, cy, r, startAngle, startAngle + sliceAngle);
    ctx.arc(cx, cy, rInner, startAngle + sliceAngle, startAngle, true);
    ctx.closePath();
    ctx.fillStyle = colors[key];
    ctx.fill();
    startAngle += sliceAngle;
  });

  // Center text
  ctx.fillStyle = '#f1f5f9';
  ctx.font = 'bold 24px Inter';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(total === 1 && counts.easy + counts.medium + counts.hard === 0 ? '0' : (counts.easy + counts.medium + counts.hard).toString(), cx, cy - 8);
  ctx.font = '12px Inter';
  ctx.fillStyle = '#94a3b8';
  ctx.fillText('Solved', cx, cy + 12);

  // Legend
  let ly = canvas.height - 10;
  ctx.textAlign = 'left';
  ctx.font = '12px Inter';
  let lx = 20;
  Object.entries(counts).forEach(([key, val]) => {
    ctx.fillStyle = colors[key];
    ctx.fillRect(lx, ly - 8, 10, 10);
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(`${key.charAt(0).toUpperCase() + key.slice(1)}: ${val}`, lx + 14, ly);
    lx += 100;
  });
}

function renderTrendChart() {
  const canvas = document.getElementById('trendChart');
  const ctx = canvas.getContext('2d');
  canvas.width = canvas.parentElement.clientWidth;
  canvas.height = 240;

  const days = 30;
  const data = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    data.push({ date: key, count: APP.activityLog[key] || 0 });
  }

  const maxVal = Math.max(...data.map(d => d.count), 1);
  const padding = { top: 20, right: 20, bottom: 30, left: 40 };
  const w = canvas.width - padding.left - padding.right;
  const h = canvas.height - padding.top - padding.bottom;

  // Grid lines
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = padding.top + (h / 4) * i;
    ctx.beginPath(); ctx.moveTo(padding.left, y); ctx.lineTo(canvas.width - padding.right, y); ctx.stroke();
  }

  // Area + Line
  const gradient = ctx.createLinearGradient(0, padding.top, 0, canvas.height - padding.bottom);
  gradient.addColorStop(0, 'rgba(99,102,241,0.3)');
  gradient.addColorStop(1, 'rgba(99,102,241,0)');

  ctx.beginPath();
  data.forEach((d, i) => {
    const x = padding.left + (i / (days - 1)) * w;
    const y = padding.top + h - (d.count / maxVal) * h;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });

  // Fill area
  const lastX = padding.left + w;
  ctx.lineTo(lastX, padding.top + h);
  ctx.lineTo(padding.left, padding.top + h);
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.fill();

  // Line
  ctx.beginPath();
  data.forEach((d, i) => {
    const x = padding.left + (i / (days - 1)) * w;
    const y = padding.top + h - (d.count / maxVal) * h;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = '#6366f1';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Dots
  data.forEach((d, i) => {
    if (d.count > 0) {
      const x = padding.left + (i / (days - 1)) * w;
      const y = padding.top + h - (d.count / maxVal) * h;
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fillStyle = '#818cf8';
      ctx.fill();
    }
  });

  // Y-axis labels
  ctx.fillStyle = '#64748b';
  ctx.font = '11px Inter';
  ctx.textAlign = 'right';
  for (let i = 0; i <= 4; i++) {
    const val = Math.round((maxVal / 4) * (4 - i));
    const y = padding.top + (h / 4) * i;
    ctx.fillText(val.toString(), padding.left - 8, y + 4);
  }
}

function renderTopicBars() {
  const container = document.getElementById('topicBars');
  const tagStats = {};
  APP.problems.forEach(p => {
    (p.tags || []).forEach(t => {
      if (!tagStats[t]) tagStats[t] = { solved: 0, total: 0 };
      tagStats[t].total++;
      if (p.status === 'solved' || p.status === 'revisited') tagStats[t].solved++;
    });
  });

  const entries = Object.entries(tagStats).sort((a, b) => b[1].total - a[1].total).slice(0, 10);

  if (entries.length === 0) {
    container.innerHTML = '<p style="color:var(--text-tertiary); text-align:center; padding:20px">Add tagged problems to see topic analysis.</p>';
    return;
  }

  container.innerHTML = entries.map(([tag, { solved, total }]) => {
    const pct = Math.round((solved / total) * 100);
    return `
      <div class="topic-bar-row">
        <span class="topic-bar-label">${tag}</span>
        <div class="topic-bar-track"><div class="topic-bar-fill" style="width:${pct}%"></div></div>
        <span class="topic-bar-value">${solved}/${total}</span>
      </div>`;
  }).join('');
}

function renderReadinessGauge() {
  const container = document.getElementById('readinessGauge');
  const score = calcReadiness();
  const color = score < 40 ? 'var(--red)' : score < 70 ? 'var(--yellow)' : 'var(--green)';

  const circumference = 2 * Math.PI * 70;
  const offset = circumference - (score / 100) * circumference;

  container.innerHTML = `
    <div class="gauge-circle">
      <svg width="160" height="160">
        <circle cx="80" cy="80" r="70" stroke="rgba(255,255,255,0.06)" stroke-width="10" fill="none"/>
        <circle cx="80" cy="80" r="70" stroke="${color}" stroke-width="10" fill="none"
                stroke-dasharray="${circumference}" stroke-dashoffset="${offset}"
                stroke-linecap="round" style="transition: stroke-dashoffset 1s ease"/>
      </svg>
      <div style="text-align:center">
        <div class="gauge-value" style="color:${color}">${score}%</div>
        <div class="gauge-label">Ready</div>
      </div>
    </div>
    <p style="color:var(--text-secondary); font-size:0.82rem; margin-top:12px; text-align:center">
      Based on topic coverage, difficulty balance, consistency, and confidence.
    </p>`;
}

function renderStatusChart() {
  const canvas = document.getElementById('statusChart');
  const ctx = canvas.getContext('2d');
  canvas.width = canvas.parentElement.clientWidth;
  canvas.height = 240;

  const counts = {
    solved: APP.problems.filter(p => p.status === 'solved').length,
    attempted: APP.problems.filter(p => p.status === 'attempted').length,
    revisited: APP.problems.filter(p => p.status === 'revisited').length,
    not_started: APP.problems.filter(p => p.status === 'not_started').length
  };

  const colors = { solved: '#22c55e', attempted: '#eab308', revisited: '#3b82f6', not_started: '#475569' };
  const labels = { solved: 'Solved', attempted: 'Attempted', revisited: 'Revisited', not_started: 'Not Started' };
  const entries = Object.entries(counts).filter(([_, v]) => v > 0);
  const barWidth = 50;
  const maxVal = Math.max(...Object.values(counts), 1);
  const padding = { top: 20, bottom: 40, left: 40, right: 20 };
  const h = canvas.height - padding.top - padding.bottom;

  if (entries.length === 0) {
    ctx.fillStyle = '#64748b';
    ctx.font = '14px Inter';
    ctx.textAlign = 'center';
    ctx.fillText('No data yet', canvas.width / 2, canvas.height / 2);
    return;
  }

  const totalWidth = entries.length * (barWidth + 30);
  const startX = (canvas.width - totalWidth) / 2 + 15;

  entries.forEach(([key, val], i) => {
    const x = startX + i * (barWidth + 30);
    const barH = (val / maxVal) * h;
    const y = padding.top + h - barH;

    // Bar gradient
    const grad = ctx.createLinearGradient(x, y, x, padding.top + h);
    grad.addColorStop(0, colors[key]);
    grad.addColorStop(1, colors[key] + '33');
    ctx.fillStyle = grad;

    // Rounded rect
    const radius = 6;
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + barWidth - radius, y);
    ctx.quadraticCurveTo(x + barWidth, y, x + barWidth, y + radius);
    ctx.lineTo(x + barWidth, padding.top + h);
    ctx.lineTo(x, padding.top + h);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.fill();

    // Value
    ctx.fillStyle = '#f1f5f9';
    ctx.font = 'bold 14px Inter';
    ctx.textAlign = 'center';
    ctx.fillText(val.toString(), x + barWidth / 2, y - 8);

    // Label
    ctx.fillStyle = '#94a3b8';
    ctx.font = '11px Inter';
    ctx.fillText(labels[key], x + barWidth / 2, canvas.height - 12);
  });
}

// ─── Render: Reminders ───
function renderReminders() {
  const list = document.getElementById('reminderList');
  if (APP.reminders.length === 0) {
    list.innerHTML = `<div class="empty-state"><div class="empty-icon">🔔</div><h3>No reminders yet</h3><p>Set daily goals, revision alerts, or custom reminders.</p><button class="btn btn-primary" onclick="openAddReminder()">+ New Reminder</button></div>`;
    return;
  }

  const icons = { daily_goal: '🎯', revision: '🔁', interview: '📅', custom: '📌' };
  const typeLabels = { daily_goal: 'Daily Goal', revision: 'Revision', interview: 'Interview', custom: 'Custom' };

  list.innerHTML = APP.reminders.map(r => `
    <div class="reminder-item">
      <div class="reminder-icon ${r.type}">${icons[r.type] || '📌'}</div>
      <div class="reminder-body">
        <div class="reminder-title">${r.title}</div>
        <div class="reminder-time">${typeLabels[r.type] || 'Custom'} · ${r.scheduledAt ? new Date(r.scheduledAt).toLocaleString() : '—'}${r.repeat ? ' · Repeats ' + r.repeat : ''}${r.description ? '<br><span style="color:var(--text-secondary)">' + r.description + '</span>' : ''}</div>
      </div>
      <button class="reminder-toggle ${r.isActive ? 'active' : ''}" onclick="toggleReminder('${r.id}')"></button>
      <div class="reminder-actions">
        <button class="btn btn-icon btn-secondary" onclick="deleteReminder('${r.id}')" title="Delete">🗑️</button>
      </div>
    </div>
  `).join('');
}

// ─── Render: Notes ───
function renderNotes() {
  const grid = document.getElementById('notesGrid');
  const query = document.getElementById('noteSearch').value.toLowerCase();

  let filtered = APP.notes;
  if (query) filtered = filtered.filter(n => n.title.toLowerCase().includes(query) || (n.content || '').toLowerCase().includes(query));

  if (filtered.length === 0) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">📝</div><h3>${APP.notes.length === 0 ? 'No notes yet' : 'No matching notes'}</h3><p>Create cheat sheets, learnings, and templates.</p>${APP.notes.length === 0 ? '<button class="btn btn-primary" onclick="openAddNote()">+ New Note</button>' : ''}</div>`;
    return;
  }

  grid.innerHTML = filtered.map(n => `
    <div class="note-card" onclick="openEditNote('${n.id}')">
      <div class="note-title">${n.isCheatSheet ? '📄 ' : ''}${n.title}</div>
      <div class="note-preview">${(n.content || '').slice(0, 150)}</div>
      <div class="note-meta">
        <span>${new Date(n.updatedAt).toLocaleDateString()}</span>
        <button class="btn btn-sm btn-danger" onclick="event.stopPropagation(); deleteNote('${n.id}')">🗑️</button>
      </div>
    </div>
  `).join('');
}

// ─── Interview Prep Features ───
let mockTimerInterval = null;
let currentSheetKey = null;

// Render sheet grid on Interview Prep page
function renderSheetGrid() {
  const grid = document.getElementById('sheetGrid');
  if (!grid || typeof SHEETS === 'undefined') return;

  let html = '';
  Object.entries(SHEETS).forEach(([key, sheet]) => {
    const progress = getSheetProgress(key);
    const imported = isSheetImported(key);
    html += `
      <div class="prep-card sheet" onclick="openSheetDetail('${key}')">
        <div class="prep-icon">${sheet.icon}</div>
        <div class="prep-title">${sheet.name}</div>
        <div class="prep-desc">${sheet.desc}</div>
        <div class="prep-progress">
          <div class="prep-progress-text">
            <span>${imported ? '✅ Imported' : `${sheet.problems.length} problems`}</span>
            <span>${progress.solved}/${progress.total}</span>
          </div>
          <div class="prep-progress-bar">
            <div class="prep-progress-fill" style="width:${progress.total ? (progress.solved / progress.total * 100) : 0}%"></div>
          </div>
        </div>
      </div>`;
  });

  // Mock interview + AI cards
  html += `
    <div class="prep-card mock" onclick="startMockInterview()">
      <div class="prep-icon">⏱️</div>
      <div class="prep-title">Mock Interview</div>
      <div class="prep-desc">Timed, randomized problem sets simulating real conditions.</div>
    </div>
    <div class="prep-card roadmap" onclick="generateRoadmap()">
      <div class="prep-icon">🤖</div>
      <div class="prep-title">AI Roadmap</div>
      <div class="prep-desc">Get a personalized study plan based on your progress.</div>
    </div>`;
  grid.innerHTML = html;
}

// Check if sheet was imported
function isSheetImported(sheetKey) {
  if (!APP.sheets) APP.sheets = [];
  return APP.sheets.includes(sheetKey);
}

// Get sheet progress (solved vs total)
function getSheetProgress(sheetKey) {
  const sheet = SHEETS[sheetKey];
  if (!sheet) return { solved: 0, total: 0 };
  const total = sheet.problems.length;
  let solved = 0;
  sheet.problems.forEach(p => {
    const match = APP.problems.find(x => x.leetcodeId === p[0]);
    if (match && (match.status === 'solved' || match.status === 'revisited')) solved++;
  });
  return { solved, total };
}

// Open sheet detail view
function openSheetDetail(sheetKey) {
  currentSheetKey = sheetKey;
  navigateTo('sheetdetail');
}

// Render sheet detail page
function renderSheetDetail() {
  const sheet = SHEETS[currentSheetKey];
  if (!sheet) { navigateTo('interview'); return; }

  document.getElementById('sheetDetailTitle').textContent = sheet.name;
  document.getElementById('sheetDetailSub').textContent = sheet.desc;

  const imported = isSheetImported(currentSheetKey);
  const btn = document.getElementById('sheetImportBtn');
  btn.textContent = imported ? '✅ Already Imported' : '📥 Import All';
  btn.disabled = imported;
  btn.style.opacity = imported ? 0.6 : 1;

  const progress = getSheetProgress(currentSheetKey);
  document.getElementById('sheetProgressText').textContent = `${progress.solved} / ${progress.total} solved`;
  document.getElementById('sheetProgressFill').style.width = `${progress.total ? (progress.solved / progress.total * 100) : 0}%`;

  // Problem list
  const problems = expandSheet(currentSheetKey);
  const list = document.getElementById('sheetProblemList');
  list.innerHTML = problems.map(p => {
    const existing = APP.problems.find(x => x.leetcodeId === p.leetcodeId);
    const status = existing ? existing.status : 'not_started';
    const statusLabel = { not_started: '⬜', attempted: '🔄', solved: '✅', revisited: '🔁' }[status] || '⬜';
    const diffColor = p.difficulty === 'easy' ? 'var(--green)' : p.difficulty === 'medium' ? 'var(--yellow)' : 'var(--red)';
    return `
      <div class="problem-row" onclick="${existing ? `openProblemDetail('${existing.id}')` : ''}">
        <span class="prob-id">#${p.leetcodeId}</span>
        <span class="prob-name">${p.title}</span>
        <span class="prob-diff" style="color:${diffColor}">${p.difficulty.charAt(0).toUpperCase() + p.difficulty.slice(1)}</span>
        <span class="prob-status status-${status}">${statusLabel}</span>
        <span class="prob-attempts">${existing ? (existing.attempts || []).length + ' att.' : '—'}</span>
        <span class="prob-tags-cell">${p.tags.join(', ')}</span>
      </div>`;
  }).join('');
}

// Import entire sheet into problem list
function importCurrentSheet() {
  if (!currentSheetKey || isSheetImported(currentSheetKey)) return;
  const problems = expandSheet(currentSheetKey);
  let added = 0;

  problems.forEach(p => {
    // Skip if already exists by leetcodeId
    if (APP.problems.find(x => x.leetcodeId === p.leetcodeId)) return;
    APP.problems.push({
      id: uuid(),
      leetcodeId: p.leetcodeId,
      title: p.title,
      url: p.url,
      difficulty: p.difficulty,
      status: 'not_started',
      tags: [...p.tags],
      notes: '',
      confidence: 0,
      attempts: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    added++;
  });

  if (!APP.sheets) APP.sheets = [];
  APP.sheets.push(currentSheetKey);
  saveData(APP);

  showToast(`📋 ${SHEETS[currentSheetKey].name}: ${added} problems imported (${problems.length - added} already existed)`);
  renderSheetDetail();
}

// Dashboard sheet progress cards
function renderDashboardSheets() {
  const container = document.getElementById('dashboardSheets');
  if (!container || !APP.sheets || APP.sheets.length === 0) {
    if (container) container.innerHTML = '';
    return;
  }

  container.innerHTML = '<div class="card"><div class="card-header"><span class="card-title">📋 Active Sheets</span></div>' +
    APP.sheets.map(key => {
      const sheet = SHEETS[key];
      if (!sheet) return '';
      const prog = getSheetProgress(key);
      const pct = prog.total ? (prog.solved / prog.total * 100) : 0;
      return `
        <div class="dashboard-sheet-card" onclick="openSheetDetail('${key}')">
          <div class="dsc-header">
            <span class="dsc-name">${sheet.icon} ${sheet.name}</span>
            <span class="dsc-count">${prog.solved}/${prog.total} (${Math.round(pct)}%)</span>
          </div>
          <div class="sheet-progress-bar"><div class="sheet-progress-fill" style="width:${pct}%"></div></div>
        </div>`;
    }).join('') + '</div>';
}

function startMockInterview() {
  const panel = document.getElementById('mockInterviewPanel');
  panel.style.display = 'block';

  const pool = APP.problems.length > 0 ? APP.problems : [];
  const count = Math.min(3, pool.length);
  if (count === 0) {
    document.getElementById('mockProblemList').innerHTML = '<p style="text-align:center; color:var(--text-tertiary); padding:20px">Add problems first to use mock interviews.</p>';
  } else {
    const shuffled = [...pool].sort(() => Math.random() - 0.5).slice(0, count);
    document.getElementById('mockProblemList').innerHTML = shuffled.map((p, i) => `
      <div class="problem-row" onclick="openProblemDetail('${p.id}')">
        <span class="prob-id">${i + 1}</span>
        <span class="prob-name">${p.title}</span>
        <span class="prob-diff" style="color:${p.difficulty === 'easy' ? 'var(--green)' : p.difficulty === 'medium' ? 'var(--yellow)' : 'var(--red)'}">${p.difficulty}</span>
      </div>`).join('');
  }

  let seconds = 45 * 60;
  document.getElementById('mockTimer').textContent = '45:00';
  clearInterval(mockTimerInterval);
  mockTimerInterval = setInterval(() => {
    seconds--;
    if (seconds <= 0) { clearInterval(mockTimerInterval); showToast("⏰ Time's up!"); return; }
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    document.getElementById('mockTimer').textContent = `${m}:${s}`;
  }, 1000);
}

function endMockInterview() {
  clearInterval(mockTimerInterval);
  document.getElementById('mockInterviewPanel').style.display = 'none';
  showToast('Mock interview ended');
}

function generateRoadmap() {
  showToast('🤖 AI Roadmap generation — Coming soon with backend integration!', 'info');
}

// ─── LeetCode Profile Sync ───
async function syncLeetCode() {
  const username = document.getElementById('settingsLCUser').value.trim();
  if (!username) { showToast('Enter a LeetCode username first', 'error'); return; }

  const statusEl = document.getElementById('lcSyncStatus');
  const resultEl = document.getElementById('lcSyncResult');
  statusEl.textContent = '⏳ Syncing...';
  resultEl.innerHTML = '';

  const query = `{
    matchedUser(username: "${username}") {
      username
      submitStatsGlobal { acSubmissionNum { difficulty count } }
    }
  }`;

  try {
    let data = null;

    // Method 1: Public LeetCode stats API (no CORS issues)
    try {
      const r1 = await fetch(`https://alfa-leetcode-api.onrender.com/userProfile/${username}`);
      if (r1.ok) {
        const j = await r1.json();
        if (j && (j.totalSolved !== undefined || j.matchedUser)) data = j;
      }
    } catch (e) { console.log('Method 1 failed:', e); }

    // Method 2: Our Vercel API proxy
    if (!data) {
      try {
        const r2 = await fetch('/api/leetcode', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username })
        });
        if (r2.ok) data = await r2.json();
      } catch (e) { console.log('Method 2 failed:', e); }
    }

    if (!data) throw new Error('All sync methods failed');

    // Handle both response formats
    let stats = {};
    let displayName = username;

    if (data?.data?.matchedUser) {
      // GraphQL format (our API proxy)
      const user = data.data.matchedUser;
      displayName = user.username;
      (user.submitStatsGlobal?.acSubmissionNum || []).forEach(s => {
        stats[s.difficulty.toLowerCase()] = s.count;
      });
    } else if (data?.totalSolved !== undefined) {
      // alfa-leetcode-api format
      stats = { all: data.totalSolved, easy: data.easySolved, medium: data.mediumSolved, hard: data.hardSolved };
    } else {
      statusEl.textContent = '❌ User not found';
      return;
    }

    APP.settings.lcUsername = username;
    APP.settings.lcStats = stats;
    APP.settings.lcSyncedAt = new Date().toISOString();
    saveData(APP);

    statusEl.textContent = `✅ Synced as ${displayName}`;
    resultEl.innerHTML = `
      <div class="lc-stats">
        <div class="lc-stat-item"><div class="lc-val" style="color:var(--green)">${stats.easy || 0}</div><div class="lc-label">Easy</div></div>
        <div class="lc-stat-item"><div class="lc-val" style="color:var(--yellow)">${stats.medium || 0}</div><div class="lc-label">Medium</div></div>
        <div class="lc-stat-item"><div class="lc-val" style="color:var(--red)">${stats.hard || 0}</div><div class="lc-label">Hard</div></div>
      </div>
      <p style="font-size:0.72rem; color:var(--text-tertiary); margin-top:8px">Total: ${(stats.all || 0)} solved  •  Last synced: ${new Date().toLocaleString()}</p>`;

    showToast(`🔗 Synced with ${displayName}'s LeetCode profile`);
  } catch (err) {
    statusEl.textContent = '❌ Sync failed — try again later';
    console.error('LeetCode sync error:', err);
  }
}

// ─── Browser Notifications ───
// Mobile Chrome requires service worker to show notifications
function showNotif(title, body) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  // Try service worker first (required for mobile)
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.ready.then(function (reg) {
      reg.showNotification(title, { body: body, icon: '🎯', badge: '🎯' });
    }).catch(function () {
      // Fallback to basic Notification (desktop)
      try { new Notification(title, { body: body }); } catch (e) { }
    });
  } else {
    // No service worker — desktop fallback
    try { new Notification(title, { body: body }); } catch (e) { }
  }
}

function enableNotifications() {
  if (!('Notification' in window)) {
    showToast('Browser notifications not supported', 'error');
    return;
  }

  // If already granted, just save and update UI
  if (Notification.permission === 'granted') {
    onNotifGranted();
    return;
  }

  // Handle both callback and promise-based APIs
  try {
    const result = Notification.requestPermission(function (perm) {
      if (perm === 'granted') onNotifGranted();
      else onNotifDenied();
    });
    if (result && result.then) {
      result.then(function (perm) {
        if (perm === 'granted') onNotifGranted();
        else onNotifDenied();
      });
    }
  } catch (e) {
    Notification.requestPermission().then(function (perm) {
      if (perm === 'granted') onNotifGranted();
      else onNotifDenied();
    });
  }
}

function onNotifGranted() {
  const btn = document.getElementById('notifBtn');
  if (btn) { btn.textContent = '✅ Enabled'; btn.disabled = true; }
  APP.settings.notificationsEnabled = true;
  saveData(APP);
  showToast('🔔 Notifications enabled!');
  showNotif('CodeTrack', "✅ Notifications are working! You'll get daily reminders.");
  updateNotifDebug();
}

function onNotifDenied() {
  showToast('Please allow notifications in browser settings', 'error');
  updateNotifDebug();
}

// Test notification immediately
function testNotifNow() {
  updateNotifDebug();
  const debug = document.getElementById('notifDebug');

  if (!('Notification' in window)) {
    if (debug) debug.innerHTML += '<br>❌ Notification API not available in this browser';
    showToast('Notifications not supported in this browser', 'error');
    return;
  }

  if (Notification.permission !== 'granted') {
    if (debug) debug.innerHTML += '<br>❌ Permission not granted — click Enable first';
    showToast('Enable notifications first', 'error');
    return;
  }

  // Try service worker method
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready.then(function (reg) {
      reg.showNotification('CodeTrack — Test ✅', {
        body: 'If you see this, notifications work! Time: ' + new Date().toLocaleTimeString(),
        tag: 'test-' + Date.now()
      }).then(function () {
        if (debug) debug.innerHTML += '<br>✅ SW notification sent at ' + new Date().toLocaleTimeString();
        showToast('✅ Test notification sent via service worker!');
      }).catch(function (err) {
        if (debug) debug.innerHTML += '<br>❌ SW error: ' + err.message;
        // Fallback
        try {
          new Notification('CodeTrack — Test', { body: 'Fallback notification at ' + new Date().toLocaleTimeString() });
          if (debug) debug.innerHTML += '<br>✅ Fallback notification sent';
        } catch (e2) {
          if (debug) debug.innerHTML += '<br>❌ Fallback error: ' + e2.message;
        }
      });
    }).catch(function (err) {
      if (debug) debug.innerHTML += '<br>❌ SW not ready: ' + err.message;
    });
  } else {
    // No service worker — try direct
    try {
      new Notification('CodeTrack — Test', { body: 'Direct notification at ' + new Date().toLocaleTimeString() });
      if (debug) debug.innerHTML += '<br>✅ Direct notification sent';
    } catch (e) {
      if (debug) debug.innerHTML += '<br>❌ Direct error: ' + e.message;
    }
  }
}

// Show notification debug info
function updateNotifDebug() {
  const debug = document.getElementById('notifDebug');
  if (!debug) return;

  const now = new Date();
  const lines = [];
  lines.push('🕐 Device Time: ' + now.toLocaleString());
  lines.push('🌐 Protocol: ' + location.protocol);
  lines.push('📍 Origin: ' + location.origin);

  // Notification API
  if ('Notification' in window) {
    lines.push('🔔 Permission: ' + Notification.permission);
  } else {
    lines.push('❌ Notification API: NOT AVAILABLE');
  }

  // Service Worker
  if ('serviceWorker' in navigator) {
    lines.push('⚙️ SW Support: Yes');
    if (navigator.serviceWorker.controller) {
      lines.push('✅ SW Active: ' + navigator.serviceWorker.controller.scriptURL.split('/').pop());
    } else {
      lines.push('⚠️ SW Controller: None (refresh page)');
    }
  } else {
    lines.push('❌ SW Support: No');
  }

  // Saved settings
  lines.push('💾 Saved enabled: ' + (APP.settings.notificationsEnabled ? 'Yes' : 'No'));

  // HTTPS check
  if (location.protocol === 'file:') {
    lines.push('⚠️ file:// — notifications need http:// or https://');
  } else if (location.protocol === 'http:' && location.hostname !== 'localhost') {
    lines.push('⚠️ HTTP non-localhost — mobile Chrome blocks notifications here');
  } else {
    lines.push('✅ Protocol OK for notifications');
  }

  // Next scheduled reminders
  lines.push('');
  lines.push('📅 Next reminders:');
  lines.push('  9:00 AM — Revision reminder');
  lines.push('  10:00 AM — Pending problems');
  lines.push('  8:00 PM — Daily goal check');

  debug.innerHTML = lines.join('<br>');
}

// Check reminders every 60 seconds
function initNotificationScheduler() {
  if (!APP.settings.notificationsEnabled || Notification.permission !== 'granted') return;

  setInterval(() => {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const hour = now.getHours();

    // Daily goal reminder at 8 PM if not met
    if (hour === 20 && now.getMinutes() < 1) {
      const todayCount = APP.activityLog[today] || 0;
      const goal = APP.settings.dailyGoal || 3;
      if (todayCount < goal) {
        showNotif('CodeTrack — Daily Goal', `You've solved ${todayCount}/${goal} today. Keep going! 💪`);
      }
    }

    // Pending problem reminder at 10 AM
    if (hour === 10 && now.getMinutes() < 1) {
      const pending = APP.problems.filter(p => p.status === 'not_started' || p.status === 'attempted').length;
      if (pending > 0) {
        showNotif('CodeTrack — Pending Problems', `You have ${pending} unsolved problems waiting.`);
      }
    }

    // Revision reminder at 9 AM
    if (hour === 9 && now.getMinutes() < 1) {
      const weekAgo = new Date(now - 7 * 86400000);
      const needsRevision = APP.problems.filter(p => {
        if (p.status !== 'solved') return false;
        const lastAttempt = (p.attempts || []).slice(-1)[0];
        return lastAttempt && new Date(lastAttempt.date) < weekAgo;
      });
      if (needsRevision.length > 0) {
        showNotif('CodeTrack — Time to Revise', `${needsRevision.length} problems need revision. 🧠`);
      }
    }

    // Custom reminders
    APP.reminders.forEach(r => {
      if (!r.isActive) return;
      const scheduled = new Date(r.scheduledAt);
      if (Math.abs(now - scheduled) < 60000) {
        showNotif('CodeTrack — ' + r.title, r.description || 'Reminder alert!');
      }
    });
  }, 60000);
}

// ─── Cross-Tab Sync ───
window.addEventListener('storage', (e) => {
  if (e.key === DB_KEY) {
    APP = loadData();
    // Re-render current page
    if (currentPage === 'dashboard') renderDashboard();
    else if (currentPage === 'problems') renderProblemList();
    else if (currentPage === 'analytics') renderAnalytics();
    else if (currentPage === 'reminders') renderReminders();
    else if (currentPage === 'notes') renderNotes();
    else if (currentPage === 'settings') loadSettings();
    else if (currentPage === 'interview') renderSheetGrid();
    else if (currentPage === 'sheetdetail') renderSheetDetail();
    else if (currentPage === 'detail') renderProblemDetail();
    showToast('Data synced from another tab', 'info');
  }
});

// ─── Updated Navigation for new pages ───
const originalNavigateTo = navigateTo;
navigateTo = function (page, skipPush) {
  originalNavigateTo(page, skipPush);
  if (page === 'interview') renderSheetGrid();
  else if (page === 'sheetdetail') renderSheetDetail();
};

// ─── Updated Settings Load ───
const originalLoadSettings = loadSettings;
loadSettings = function () {
  originalLoadSettings();
  // LeetCode
  const lcField = document.getElementById('settingsLCUser');
  if (lcField) lcField.value = APP.settings.lcUsername || '';
  if (APP.settings.lcStats) {
    const s = APP.settings.lcStats;
    document.getElementById('lcSyncResult').innerHTML = `
      <div class="lc-stats">
        <div class="lc-stat-item"><div class="lc-val" style="color:var(--green)">${s.easy || 0}</div><div class="lc-label">Easy</div></div>
        <div class="lc-stat-item"><div class="lc-val" style="color:var(--yellow)">${s.medium || 0}</div><div class="lc-label">Medium</div></div>
        <div class="lc-stat-item"><div class="lc-val" style="color:var(--red)">${s.hard || 0}</div><div class="lc-label">Hard</div></div>
      </div>`;
    document.getElementById('lcSyncStatus').textContent = APP.settings.lcSyncedAt
      ? `✅ Last synced: ${new Date(APP.settings.lcSyncedAt).toLocaleDateString()}`
      : '';
  }
  // Notifications
  const notifBtn = document.getElementById('notifBtn');
  if (APP.settings.notificationsEnabled && 'Notification' in window && Notification.permission === 'granted') {
    if (notifBtn) { notifBtn.textContent = '✅ Enabled'; notifBtn.disabled = true; }
  }
  updateNotifDebug();
};

// ─── Updated Dashboard ───
const originalRenderDashboard = renderDashboard;
renderDashboard = function () {
  originalRenderDashboard();
  renderDashboardSheets();
};

// ─── Canvas resize ───
window.addEventListener('resize', () => {
  if (currentPage === 'analytics') renderAnalytics();
});

// ─── Init ───
if (!APP.sheets) APP.sheets = [];

// Fresh start: clear old test data and auto-import LeetCode 75
if (!APP._v2initialized) {
  APP.problems = [];
  APP.sheets = [];
  APP.activityLog = {};
  APP._v2initialized = true;

  // Auto-import LeetCode 75
  if (typeof SHEETS !== 'undefined' && SHEETS.leetcode75) {
    const problems = expandSheet('leetcode75');
    problems.forEach(p => {
      APP.problems.push({
        id: uuid(),
        leetcodeId: p.leetcodeId,
        title: p.title,
        url: p.url,
        difficulty: p.difficulty,
        status: 'not_started',
        tags: [...p.tags],
        notes: '',
        confidence: 0,
        attempts: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    });
    APP.sheets.push('leetcode75');
  }
  saveData(APP);
}

renderDashboard();
initNotificationScheduler();


