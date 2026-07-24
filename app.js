// Configuration points directly to your main application Node.js backend
const API_BASE_URL = 'http://localhost:3000/api';

// Event Bindings
document.getElementById('btnSync').addEventListener('click', syncLeetCodeProfile);
document.getElementById('btnAddManual').addEventListener('click', addManualProblem);
document.getElementById('btnRecommend').addEventListener('click', getNextRecommendation);

// Helper to render UI messages dynamically
function showStatus(text, type = 'info') {
    const statusMsg = document.getElementById('statusMessage');
    statusMsg.innerText = text;
    
    if (type === 'error') {
        statusMsg.style.color = 'var(--error)';
    } else if (type === 'success') {
        statusMsg.style.color = 'var(--success)';
    } else {
        statusMsg.style.color = 'var(--text-muted)';
    }
}

// 1. Trigger Node.js Sync Route (which uses Python under the hood)
async function syncLeetCodeProfile() {
    const uid = document.getElementById('uidInput').value.trim();
    const cookie = document.getElementById('cookieInput').value.trim();

    if (!uid || !cookie) {
        showStatus('Error: UID and Session Cookie values are mandatory.', 'error');
        return;
    }

    showStatus('Initiating account handshake with Node.js backend...');

    try {
        const response = await fetch(`${API_BASE_URL}/sync-leetcode`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ uid, cookie })
        });

        const data = await response.json();

        if (response.ok) {
            showStatus(`Profile updated successfully! Synced ${data.synced_count} tasks.`, 'success');
            document.getElementById('cookieInput').value = ''; // Clean field
        } else {
            showStatus(data.error || 'Sync request failed.', 'error');
        }
    } catch (err) {
        showStatus('Network connection refused. Verify Node.js server is running on port 3000.', 'error');
    }
}

// 2. Add single question relation mapping manually
async function addManualProblem() {
    const uid = document.getElementById('uidInput').value.trim();
    const qNum = parseInt(document.getElementById('manualQNum').value.trim());

    if (!uid || !qNum) {
        showStatus('Error: Provide valid UID and Question values.', 'error');
        return;
    }

    showStatus('Updating problem connection matrix fields...');

    try {
        const response = await fetch(`${API_BASE_URL}/add-solved`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ uid, question_number: qNum })
        });

        const data = await response.json();

        if (response.ok) {
            showStatus('Problem mapped into junction index successfully.', 'success');
            document.getElementById('manualQNum').value = '';
        } else {
            showStatus(data.error || 'Failed to submit problem index.', 'error');
        }
    } catch (err) {
        showStatus('Server connection error.', 'error');
    }
}

// 3. Request dynamic vector space evaluation match
async function getNextRecommendation() {
    const uid = document.getElementById('uidInput').value.trim();
    const difficulty = document.getElementById('difficultyFilter').value;
    const topic = document.getElementById('topicFilter').value;
    const recBox = document.getElementById('recommendationBox');

    if (!uid) {
        showStatus('Error: UID must be specified to scan vector properties.', 'error');
        return;
    }

    showStatus('Analyzing open relational matrices...');
    recBox.innerHTML = '<p class="placeholder-text">Running Vector Similarity Proximity checks...</p>';

    try {
        const response = await fetch(`${API_BASE_URL}/get-next`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ uid, difficulty, topic })
        });

        const data = await response.json();

        if (response.ok && data.recommended_problem) {
            showStatus('Vector matching execution complete.', 'success');
            
            const prob = data.recommended_problem;
            const percentageMatch = (data.similarity_match * 100).toFixed(1);

            recBox.innerHTML = `
                <div class="rec-card">
                    <h3>Problem #${prob.question_number}</h3>
                    <p><strong>${prob.title}</strong></p>
                    <div>
                        <span class="badge">${prob.difficulty}</span>
                        <span class="badge" style="background-color: var(--primary)">Match Profile: ${percentageMatch}%</span>
                    </div>
                </div>
            `;
        } else {
            showStatus(data.message || data.error || 'Calculation failed.', 'error');
            recBox.innerHTML = `<p class="placeholder-text" style="color: var(--error)">${data.message || 'No available problems match specified criteria.'}</p>`;
        }
    } catch (err) {
        showStatus('Could not complete mathematical recommendation pipeline.', 'error');
        recBox.innerHTML = '<p class="placeholder-text">Pipeline configuration connection offline.</p>';
    }
}