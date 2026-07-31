// =====================================================================
// dashboard.js — frontpage2.html behavior: user stats, recommendation
// fetch, boost/suppress topic pickers, solved/difficult marking.
//
// KEY FIX: on every page load this ALWAYS calls GET /api/user/:uid
// first and overwrites localStorage with the fresh result. Previously
// this endpoint didn't exist on the server, so the fetch silently
// 404'd and the dashboard kept showing whatever was cached from the
// login response — which is why the count never updated after adding
// questions on the profile setup page. Now it's the single source of
// truth on every load.
// =====================================================================

let user = JSON.parse(localStorage.getItem('user'));
let currentRecId = null;

if (!user || !user.uid) {
 alert('User session not found. Please log in again.');
  window.location.href = '/front.html';
}

//
document.addEventListener("DOMContentLoaded", async () => {
  // 1. Fetch data from backend on page load
  const topicStats = await fetchTopicData();

  // 2. Select all topic elements defined in HTML
  const topicWrappers = document.querySelectorAll(".topic-wrapper");

  topicWrappers.forEach((wrapper) => {
    const topicName = wrapper.getAttribute("data-topic");
    const stats = topicStats[topicName] || {
      solved: 0,
      total: 100,
      easy: 0,
      medium: 0,
      hard: 0,
      peers: []
    };

    const percent = Math.round((stats.solved / stats.total) * 100);

    // Update Percentage Pill on the visible badge
    const percentPill = wrapper.querySelector(".percent-pill");
    if (percentPill) {
      percentPill.textContent = `${percent}%`;
    }

    // Populate Tooltip HTML ahead of time
    const tooltipCard = wrapper.querySelector(".tooltip-card");
    if (tooltipCard) {
      tooltipCard.innerHTML = `
        <div class="tooltip-header">
          <span class="tooltip-title">${topicName}</span>
          <span class="tooltip-count">${stats.solved}/${stats.total}</span>
        </div>

        <div class="progress-track">
          <div class="progress-fill" style="width: ${percent}%;"></div>
        </div>

        <div class="difficulty-grid">
          <div class="diff-box diff-easy">
            <div style="font-weight:bold;">${stats.easy}</div>
            <div>Easy</div>
          </div>
          <div class="diff-box diff-medium">
            <div style="font-weight:bold;">${stats.medium}</div>
            <div>Medium</div>
          </div>
          <div class="diff-box diff-hard">
            <div style="font-weight:bold;">${stats.hard}</div>
            <div>Hard</div>
          </div>
        </div>

        <div class="peers-section">
          <span class="peers-label">Boosting Peers:</span>
          <div class="peers-tags">
            ${stats.peers.map((p) => `<span class="peer-tag">${p}</span>`).join("")}
          </div>
        </div>
      `;
    }
  });
});

// Helper function to mock or fetch topic metrics on load
async function fetchTopicData() {
  // Replace this object with your actual fetch call to server.js
  // e.g., return fetch('/api/user-topic-stats').then(res => res.json());

  return {
    "Dynamic Programming": { solved: 24, total: 60, easy: 10, medium: 10, hard: 4, peers: ["Recursion", "Memoization", "Greedy", "Array"] },
    "Binary Tree": { solved: 32, total: 50, easy: 15, medium: 12, hard: 5, peers: ["Tree", "DFS", "BFS", "Recursion"] },
    "Two Pointers": { solved: 18, total: 30, easy: 10, medium: 6, hard: 2, peers: ["Array", "String", "Sorting", "Sliding Window"] },
    "Graph": { solved: 12, total: 40, easy: 2, medium: 7, hard: 3, peers: ["BFS", "DFS", "Union Find", "Shortest Path"] },
    "Array": { solved: 85, total: 100, easy: 50, medium: 25, hard: 10, peers: ["Two Pointers", "Sliding Window", "Sorting", "Hash Table"] }
  };
}
// ---------------------------------------------------------------------
// Boost / Suppress topic selectors
// ---------------------------------------------------------------------
function populateTopicSelectors() {
  const boostSelect = document.getElementById('boostTopics');
  const suppressSelect = document.getElementById('suppressTopics');
  if (!boostSelect || !suppressSelect || typeof TOPIC_NAMES === 'undefined') return;

  TOPIC_NAMES.forEach(topic => {
    const boostOption = document.createElement('option');
    boostOption.value = topic;
    boostOption.textContent = topic;
    boostSelect.appendChild(boostOption);

    const suppressOption = document.createElement('option');
    suppressOption.value = topic;
    suppressOption.textContent = topic;
    suppressSelect.appendChild(suppressOption);
  });
}

function getSelectedValues(selectElement) {
  if (!selectElement) return [];
  return Array.from(selectElement.selectedOptions).map(opt => opt.value);
}

// ---------------------------------------------------------------------
// Login button state
// ---------------------------------------------------------------------
function refreshLoginButtonState() {
  const loginBtn = document.getElementById('loginBtn');
  if (!loginBtn) return;

  if (user && user.uid) {
    loginBtn.textContent = 'Logged In';
    loginBtn.disabled = true;
    loginBtn.classList.remove('btn-primary');
    loginBtn.classList.add('btn-ghost');
    loginBtn.onclick = null;
  } else {
    loginBtn.textContent = 'Log In';
    loginBtn.disabled = false;
    loginBtn.classList.add('btn-primary');
    loginBtn.classList.remove('btn-ghost');
    loginBtn.onclick = handleLoginClick;
  }
}

function handleLoginClick() {
  const userTextDiv = document.getElementById('userTextDiv');
  if (user && user.uid) {
    userTextDiv.textContent = 'You are already logged in!';
    userTextDiv.style.color = 'var(--success)';
  } else {
    window.location.href = '/front.html';
  }
}

// ---------------------------------------------------------------------
// Sync status
// ---------------------------------------------------------------------
async function checkBackendSyncStatus(uid) {
  try {
    const res = await fetch(`/api/is-synced/${uid}`);
    if (res.ok) {
      const data = await res.json();
      return Boolean(data.is_synced);
    }
  } catch (err) {
    console.warn('Error checking sync status from backend:', err);
  }
  return false;
}

function handleSyncRedirect() {
  const userTextDiv = document.getElementById('userTextDiv');
  if (!user || !user.uid) {
    userTextDiv.textContent = 'You are not logged in. Please log in first.';
    userTextDiv.style.color = 'var(--error)';
    return;
  }
  window.location.href = '/profile_setup.html';
}

function updateSyncButton(isSynced) {
  const syncBtn = document.getElementById('syncBtnNav');
  if (!syncBtn) return;

  syncBtn.textContent = isSynced ? 'Synced ✓' : 'Not Synced';
  syncBtn.classList.toggle('btn-success', isSynced);
  syncBtn.classList.toggle('btn-danger', !isSynced);
  syncBtn.onclick = handleSyncRedirect;
}

// ---------------------------------------------------------------------
// Dashboard init — ALWAYS fetches the fresh user record first
// ---------------------------------------------------------------------
async function initDashboard() {
  refreshLoginButtonState();

  if (!user || !user.uid) {
    updateSyncButton(false);
    return;
  }

  // Render whatever we have cached immediately so the page isn't blank...
  renderUserInfo();

  // ...then always overwrite with the fresh server copy
  try {
    const [freshUserRes, isSynced] = await Promise.all([
      fetch(`/api/user/${user.uid}`).then(r => (r.ok ? r.json() : null)),
      checkBackendSyncStatus(user.uid)
    ]);

    if (freshUserRes) {
      user = { ...user, ...freshUserRes };
      localStorage.setItem('user', JSON.stringify(user));
      renderUserInfo();
    }

    updateSyncButton(isSynced);
  } catch (err) {
    console.warn('Could not fetch latest details, using cached state:', err);
    const fallbackSync = await checkBackendSyncStatus(user.uid);
    updateSyncButton(fallbackSync);
  }
}

function renderUserInfo() {
  if (!user) return;

  const navUser = document.getElementById('navUsername');
  const statUid = document.getElementById('statUid');
  const statCount = document.getElementById('statCount');
  const statDifficult = document.getElementById('statDifficult');
  const badge = document.getElementById('statVectorStatus');

  if (navUser) navUser.textContent = `Welcome, ${user.username || 'Developer'}`;
  if (statUid) statUid.textContent = `#${user.uid}`;
  if (statCount) statCount.textContent = user.question_count || 0;
  if (statDifficult) statDifficult.textContent = user.difficult_count ?? 0;

  if (badge) {
    if (user.has_vector) {
      badge.textContent = 'Active';
      badge.className = 'pill pill-ready';
    } else {
      badge.textContent = 'Pending';
      badge.className = 'pill pill-pending';
    }
  }
}

// ---------------------------------------------------------------------
// Recommendation fetch
// ---------------------------------------------------------------------
async function fetchRecommendation() {
  const userTextDiv = document.getElementById('userTextDiv');

  if (!user || !user.uid) {
    userTextDiv.textContent = 'You are not logged in. Please log in first.';
    userTextDiv.style.color = 'var(--error)';
    updateSyncButton(false);
    return;
  }
  userTextDiv.textContent = '';

  const difficulty = document.getElementById('diffFilter').value;
  const boost_topics = getSelectedValues(document.getElementById('boostTopics'));
  const suppress_topics = getSelectedValues(document.getElementById('suppressTopics'));

  const recTitle = document.getElementById('recTitle');
  const recDiff = document.getElementById('recDifficulty');
  const recScore = document.getElementById('recScore');
  const scoreContainer = document.getElementById('scoreContainer');
  const recActions = document.getElementById('recActions');

  recTitle.textContent = 'Calculating similarity vectors...';
  recDiff.textContent = '';

  try {
    const res = await fetch('/api/get-next', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid: user.uid, difficulty, boost_topics, suppress_topics })
    });

    const data = await res.json();

    if (res.ok && data.recommended_problem) {
      const prob = data.recommended_problem;
      currentRecId = prob.question_number;

      recTitle.textContent = `#${prob.question_number} - ${prob.title}`;
      recDiff.textContent = `Difficulty: ${prob.difficulty}`;
      recScore.textContent = (data.similarity_match * 100).toFixed(2) + '%';

      scoreContainer.classList.remove('hidden');
      recActions.classList.remove('hidden');
    } else {
      recTitle.textContent = data.message || data.error || 'No recommendation found.';
      scoreContainer.classList.add('hidden');
      recActions.classList.add('hidden');
    }
  } catch (err) {
    recTitle.textContent = 'Error connecting to recommendation service.';
  }
}

// ---------------------------------------------------------------------
// Solved / Difficult marking
// ---------------------------------------------------------------------
async function markCurrentAsSolved() {
  if (!currentRecId) return;
  await submitSolved(currentRecId);
  fetchRecommendation();
}

async function markCurrentAsDifficult() {
  if (!currentRecId || !user || !user.uid) return;
  try {
    await fetch('/api/mark-difficult', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid: user.uid, question_number: currentRecId })
    });
    user.difficult_count = (user.difficult_count || 0) + 1;
    localStorage.setItem('user', JSON.stringify(user));
    renderUserInfo();
  } catch (err) {
    console.error('Failed to mark difficult:', err);
  }
  fetchRecommendation();
}

document.getElementById('markSolvedForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const qNum = parseInt(document.getElementById('quickQNum').value);
  await submitSolved(qNum);
  document.getElementById('quickQNum').value = '';
});

async function submitSolved(question_number) {
  if (!user || !user.uid) return;
  try {
    const res = await fetch('/api/add-solved', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid: user.uid, question_number })
    });

    if (res.ok) {
      // Re-fetch the true user object from MySQL
      const freshRes = await fetch(`/api/user/${user.uid}`);
      if (freshRes.ok) {
        const freshUser = await freshRes.json();
        user = { ...user, ...freshUser };
        localStorage.setItem('user', JSON.stringify(user));
        renderUserInfo();
      }
    }
  } catch (err) {
    console.error('Failed to mark solved:', err);
  }
}

function logout() {
  localStorage.clear();
  window.location.href = '/front.html';
}

// Run initialization

populateTopicSelectors();
initDashboard();
