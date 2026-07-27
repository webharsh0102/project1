// =====================================================================
// login.js — handles the Log In / Sign Up toggle and form submission
// on front.html
// =====================================================================

let mode = 'login';

// Switches between Log In and Sign Up UI states
function switchTab(targetMode) {
  mode = targetMode;
  const tabLogin = document.getElementById('tabLogin');
  const tabRegister = document.getElementById('tabRegister');
  const submitBtn = document.getElementById('submitBtn');
  const subtext = document.getElementById('formSubtext');

  const isLogin = mode === 'login';
  tabLogin.classList.toggle('active', isLogin);
  tabRegister.classList.toggle('active', !isLogin);

  submitBtn.textContent = isLogin ? 'Log In' : 'Create Account & Continue';
  subtext.textContent = isLogin
    ? 'Sign in to access your personalized recommendations'
    : 'Create an account to start setting up your skill vector';
}

document.getElementById('authForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;
  const errorMsg = document.getElementById('errorMsg');

  errorMsg.classList.add('hidden');

  // Uses relative endpoint matching the Express server route
  const endpoint = mode === 'register' ? '/register' : '/login';

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const data = await response.json();

    if (response.ok) {
      // Store session details for other pages to read
      localStorage.setItem('user', JSON.stringify(data.user));

      if (mode === 'register') {
        // New user goes to initial vector setup
        window.location.href = '/profile_setup.html';
      } else {
        // Existing user goes straight to dashboard/recommendations
        window.location.href = '/frontpage2.html';
      }
    } else {
      errorMsg.textContent = data.message || 'Authentication failed.';
      errorMsg.classList.remove('hidden');
    }
  } catch (err) {
    errorMsg.textContent = 'Server unreachable. Make sure node server.js is running.';
    errorMsg.classList.remove('hidden');
  }
});
