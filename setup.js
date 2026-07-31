// =====================================================================
// setup.js — handles profile_setup.html: LeetCode sync, manual add,
// "not solved yet" checkbox, and final submit to the dashboard
// =====================================================================

const user = JSON.parse(localStorage.getItem('user'));
const addedQuestions = new Set();

if (!user || !user.uid) {
  alert('User session not found. Please log in again.');
  window.location.href = '/front.html';
}

function showAlert(msg, isSuccess = true) {
  const box = document.getElementById('alertBox');
  box.className = `alert-banner ${isSuccess ? 'success' : 'error'}`;
  box.textContent = msg;
  box.classList.remove('hidden');
}

// Greys out the manual-add section when "I haven't solved anything" is
// checked, since the two options are mutually exclusive in practice
function toggleNoSolvedState() {
  const checked = document.getElementById('noSolvedCheckbox').checked;
  const manualForm = document.getElementById('addSolvedForm');
  manualForm.querySelectorAll('input, button').forEach(el => el.disabled = checked);
  manualForm.style.opacity = checked ? '0.5' : '1';
}

// Handle Manual Problem Add
document.getElementById('addSolvedForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const qNum = parseInt(document.getElementById('questionNum').value);

  try {
    const res = await fetch('/api/add-solved', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid: user.uid, question_number: qNum })
    });
    const data = await res.json();

    if (res.ok) {
      addedQuestions.add(qNum);
      updateQuestionBadges();
      showAlert(`Added problem #${qNum} to your profile!`);
      document.getElementById('questionNum').value = '';
    } else {
      showAlert(data.error || 'Failed to add question', false);
    }
  } catch (err) {
    showAlert('Server connection failed.', false);
  }
});

// Handle Sync via Credentials
async function syncLeetCode() {
  const session = document.getElementById('sessionInput').value.trim();
  const csrf = document.getElementById('csrfInput').value.trim();

  if (!session || !csrf) {
    return showAlert('Please enter both LEETCODE_SESSION and CSRF_TOKEN.', false);
  }

  showAlert('Fetching all solved problems from LeetCode... this may take a few seconds.', true);

  try {
    const res = await fetch('/api/sync-leetcode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uid: user.uid,
        cookie: `LEETCODE_SESSION=${session}; csrftoken=${csrf}`,
        csrf_token: csrf
      })
    });
    const data = await res.json();

    if (res.ok) {
      showAlert(`Successfully fetched and synced ${data.synced_count} solved questions!`);
    } else {
      showAlert(data.error || 'Sync failed.', false);
    }
  } catch (err) {
    showAlert('Error connecting to server pipeline.', false);
  }
}

function updateQuestionBadges() {
  const container = document.getElementById('addedList');
  if (addedQuestions.size === 0) {
    container.innerHTML = '<span class="empty-note">No questions added yet</span>';
    return;
  }
  container.innerHTML = Array.from(addedQuestions)
    .map(q => `<span class="badge">#${q}</span>`)
    .join('');
}

// Finishes setup and always pulls a FRESH copy of the user record
// afterward, so the dashboard never shows a stale question_count.
async function finishSetup() {
  const isChecked = document.getElementById('noSolvedCheckbox').checked;
  const questionList = Array.from(addedQuestions);

  try {
    if (questionList.length > 0) {
      showAlert('Saving manual questions and updating profile...', true);

      const response = await fetch('/api/save-manual-setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid: user.uid, questions: questionList })
      });

      const data = await response.json();
      if (!response.ok) {
        return showAlert(data.error || 'Failed to save questions.', false);
      }
    } else if (isChecked) {
      showAlert('Setting up fresh profile status...', true);

      const response = await fetch('/api/mark-synced', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid: user.uid })
      });

      const data = await response.json();
      if (!response.ok) {
        return showAlert(data.error || 'Failed to update sync status.', false);
      }
    }

    // Pull the real, current user record (fresh question_count,
    // has_vector, synced) instead of hand-patching localStorage —
    // this is what actually fixes the dashboard showing a stale count.
    const freshRes = await fetch(`/api/user/${user.uid}`);
    if (freshRes.ok) {
      const freshUser = await freshRes.json();
      localStorage.setItem('user', JSON.stringify({ ...user, ...freshUser }));
    }
  } catch (error) {
    return showAlert('Network error while completing setup.', false);
  }

  window.location.href = '/frontpage2.html';
}
