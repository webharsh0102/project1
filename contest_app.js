// =====================================================================
// contest_app.js
// Virtual Contest page. No dedicated contest tables on the server —
// this just asks for 4 fresh UNSOLVED questions, runs a 2hr timer in
// the browser (persisted in localStorage so a refresh doesn't reset
// it), and marks each question solved/difficult by calling the SAME
// endpoints the dashboard uses (/api/add-solved, /api/mark-difficult,
// /api/unmark-solved, /api/unmark-difficult). That keeps
// user_solved_history / user_difficult_history as the one and only
// source of truth — a solved contest question can never be suggested
// again anywhere in the app.
// =====================================================================

const user = JSON.parse(localStorage.getItem('user'));
const STORAGE_KEY = 'active_contest';
const DURATION_SECONDS = 7200; // 2 hours

let contestState = null;        // { questions: [...], startTime, durationSeconds }
let countdownInterval = null;

const SLOT_LABELS = {
  easy: 'Question 1 · Easy',
  medium_1: 'Question 2 · Medium',
  medium_2: 'Question 3 · Medium',
  hard: 'Question 4 · Hard'
};

// ---------------------------------------------------------------------
// Page init: resume a contest already in progress (saved in
// localStorage), otherwise show the start screen.
// ---------------------------------------------------------------------
function init() {
  if (!user || !user.uid) {
    document.getElementById('startScreen').innerHTML =
      '<p>Please log in first.</p><button class="btn btn-primary" onclick="window.location.href=\'/front.html\'">Go to Login</button>';
    return;
  }

  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    contestState = JSON.parse(saved);
    const elapsed = Math.floor((Date.now() - contestState.startTime) / 1000);
    if (elapsed < contestState.durationSeconds) {
      renderQuestions();
      startCountdown();
      return;
    }
    // Old contest already timed out — clear it and show start screen
    localStorage.removeItem(STORAGE_KEY);
  }
}

// ---------------------------------------------------------------------
// Start a brand-new contest: fetch 4 unsolved questions, save state
// ---------------------------------------------------------------------
async function startContest() {
  const startBtn = document.getElementById('startBtn');
  const startError = document.getElementById('startError');
  startError.classList.add('hidden');
  startBtn.disabled = true;
  startBtn.textContent = 'Building your contest...';

  try {
    const res = await fetch('/api/contest/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid: user.uid })
    });
    const data = await res.json();

    if (!res.ok) {
      startError.textContent = data.error || 'Could not start contest.';
      startError.classList.remove('hidden');
      startBtn.disabled = false;
      startBtn.textContent = 'Start Virtual Contest';
      return;
    }

    contestState = {
      questions: data.questions.map(q => ({ ...q, status: 'pending' })),
      startTime: Date.now(),
      durationSeconds: DURATION_SECONDS
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(contestState));

    renderQuestions();
    startCountdown();
  } catch (err) {
    startError.textContent = 'Server connection failed.';
    startError.classList.remove('hidden');
    startBtn.disabled = false;
    startBtn.textContent = 'Start Virtual Contest';
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(contestState));
}

// ---------------------------------------------------------------------
// Countdown timer, computed off contestState.startTime so it survives
// a page refresh. Auto-submits when it hits zero.
// ---------------------------------------------------------------------
function startCountdown() {
  if (countdownInterval) clearInterval(countdownInterval);

  countdownInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - contestState.startTime) / 1000);
    const remaining = contestState.durationSeconds - elapsed;
    renderTimer(remaining);

    if (remaining <= 0) {
      clearInterval(countdownInterval);
      submitContest(); // time's up — auto-submit whatever was marked
    }
  }, 1000);

  const elapsedNow = Math.floor((Date.now() - contestState.startTime) / 1000);
  renderTimer(contestState.durationSeconds - elapsedNow);
}

function renderTimer(totalSeconds) {
  const display = document.getElementById('timerDisplay');
  const clamped = Math.max(0, totalSeconds);

  const hrs = String(Math.floor(clamped / 3600)).padStart(2, '0');
  const mins = String(Math.floor((clamped % 3600) / 60)).padStart(2, '0');
  const secs = String(clamped % 60).padStart(2, '0');

  display.textContent = `${hrs}:${mins}:${secs}`;
  display.classList.toggle('timer-low', clamped <= 300); // red under 5 min
}

// ---------------------------------------------------------------------
// Render the 4 question cards from contestState.questions
// ---------------------------------------------------------------------
function renderQuestions() {
  document.getElementById('startScreen').classList.add('hidden');
  const grid = document.getElementById('questionGrid');
  const submitBar = document.getElementById('submitBar');
  grid.classList.remove('hidden');
  submitBar.classList.remove('hidden');

  grid.innerHTML = contestState.questions.map(q => buildCardHtml(q)).join('');
}

function buildCardHtml(q) {
  const stateClass = q.status === 'solved' ? 'state-solved'
    : q.status === 'difficult' ? 'state-difficult' : '';

  const statusLabel = q.status === 'solved' ? '✓ Solved'
    : q.status === 'difficult' ? '⚠ Found Difficult' : 'Not attempted yet';

  return `
    <div class="q-card ${stateClass}" id="card-${q.question_number}">
      <div class="q-card-top">
        <div>
          <div class="q-slot-label">${SLOT_LABELS[q.slot] || q.slot}</div>
          <div class="q-title">#${q.question_number} — ${q.title}</div>
        </div>
        <span class="q-badge diff-${q.difficulty}">${q.difficulty}</span>
      </div>

      <span class="q-status-tag ${q.status}">${statusLabel}</span>

      <div class="q-actions">
        <button class="btn ${q.status === 'solved' ? 'btn-success' : 'btn-outline-success'}"
                onclick="toggleStatus(${q.question_number}, 'solved')">
          ${q.status === 'solved' ? '✓ Solved (undo)' : '✓ Solved'}
        </button>
        <button class="btn ${q.status === 'difficult' ? 'btn-warning' : 'btn-outline-warning'}"
                onclick="toggleStatus(${q.question_number}, 'difficult')">
          ${q.status === 'difficult' ? '⚠ Difficult (undo)' : '⚠ Difficult'}
        </button>
      </div>
    </div>
  `;
}

// ---------------------------------------------------------------------
// Toggle a question's status: clicking the already-active button
// undoes it (back to pending); clicking the other button switches it.
// Calls the SAME endpoints used elsewhere in the app, so
// user_solved_history / user_difficult_history are always the real,
// single source of truth.
// ---------------------------------------------------------------------
async function toggleStatus(questionNumber, targetStatus) {
  const q = contestState.questions.find(item => item.question_number === questionNumber);
  if (!q) return;

  const wasAlready = q.status === targetStatus;

  try {
    if (targetStatus === 'solved') {
      if (wasAlready) {
        await fetch('/api/unmark-solved', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ uid: user.uid, question_number: questionNumber })
        });
        q.status = 'pending';
      } else {
        await fetch('/api/add-solved', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ uid: user.uid, question_number: questionNumber })
        });
        q.status = 'solved';
      }
    } else { // targetStatus === 'difficult'
      if (wasAlready) {
        await fetch('/api/unmark-difficult', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ uid: user.uid, question_number: questionNumber })
        });
        q.status = 'pending';
      } else {
        await fetch('/api/mark-difficult', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ uid: user.uid, question_number: questionNumber })
        });
        q.status = 'difficult';
      }
    }
  } catch (err) {
    console.error('Failed to update question status:', err);
    return;
  }

  saveState();
  const card = document.getElementById(`card-${questionNumber}`);
  if (card) card.outerHTML = buildCardHtml(q);
}

// ---------------------------------------------------------------------
// Submit — just stops the timer, clears the saved contest, and shows
// a summary of the local statuses (the real data was already written
// to the DB the moment each question was marked, above).
// ---------------------------------------------------------------------
function submitContest() {
  if (countdownInterval) clearInterval(countdownInterval);

  document.getElementById('questionGrid').classList.add('hidden');
  document.getElementById('submitBar').classList.add('hidden');
  renderResults(contestState.questions);

  localStorage.removeItem(STORAGE_KEY);
}

function renderResults(questions) {
  const solvedCount = questions.filter(r => r.status === 'solved').length;
  const difficultCount = questions.filter(r => r.status === 'difficult').length;
  const pendingCount = questions.filter(r => r.status === 'pending').length;

  const rowsHtml = questions.map(r => {
    const tag = r.status === 'solved' ? '✓ Solved'
      : r.status === 'difficult' ? '⚠ Found Difficult' : '— Not Attempted';
    const tagClass = r.status === 'solved' ? 'solved'
      : r.status === 'difficult' ? 'difficult' : 'pending';

    return `
      <div class="result-row">
        <div>
          <div class="r-title">#${r.question_number} — ${r.title}</div>
          <div class="r-meta">${r.difficulty} · ${SLOT_LABELS[r.slot] || r.slot}</div>
        </div>
        <span class="q-status-tag ${tagClass}">${tag}</span>
      </div>
    `;
  }).join('');

  const panel = document.getElementById('resultsPanel');
  panel.classList.remove('hidden');
  panel.innerHTML = `
    <h2>Contest Results</h2>
    <p style="text-align:center; margin-bottom:1.5rem;">
      ${solvedCount} solved · ${difficultCount} found difficult · ${pendingCount} not attempted
    </p>
    ${rowsHtml}
    <button class="btn btn-primary" style="width:100%; margin-top:1.5rem;"
            onclick="window.location.href='/frontpage2.html'">Back to Dashboard</button>
  `;
}

init();
