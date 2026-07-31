let mode = 'login';
let registerStage = 'initial'; // 'initial' -> 'otp_sent' -> 'otp_verified'

function switchTab(targetMode) {
  const allFields = document.querySelectorAll('.hidden3');
  allFields.forEach(field => field.classList.toggle('hidden2'));

  mode = targetMode;
  registerStage = 'initial'; // reset whenever switching tabs

  const tabLogin = document.getElementById('tabLogin');
  const tabRegister = document.getElementById('tabRegister');
  const submitBtn = document.getElementById('submitBtn');
  const subtext = document.getElementById('formSubtext');

  const isLogin = mode === 'login';
  tabLogin.classList.toggle('active', isLogin);
  tabRegister.classList.toggle('active', !isLogin);

  submitBtn.textContent = isLogin ? 'Log In' : 'Send OTP';
  subtext.textContent = isLogin
    ? 'Sign in to access your personalized recommendations'
    : 'Create an account to start setting up your skill vector';
}

document.getElementById('authForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errorMsg = document.getElementById('errorMsg');
  const submitBtn = document.getElementById('submitBtn');
  errorMsg.classList.add('hidden');

  if (mode === 'login') {
    await handleLogin(errorMsg);
    return;
  }

  // mode === 'register' — branch on current stage
  if (registerStage === 'initial') {
    await handleSendOtp(errorMsg, submitBtn);
  } else if (registerStage === 'otp_sent') {
    await handleVerifyOtp(errorMsg, submitBtn);
  } else if (registerStage === 'otp_verified') {
    await handleRegister(errorMsg);
  }
});

async function handleLogin(errorMsg) {
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;

  try {
    const res = await fetch('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();

    if (res.ok) {
      localStorage.setItem('user', JSON.stringify(data.user));
      window.location.href = '/frontpage2.html';
    } else {
      errorMsg.textContent = data.message || 'Authentication failed.';
      errorMsg.classList.remove('hidden');
    }
  } catch (err) {
    errorMsg.textContent = 'Server unreachable. Make sure node server.js is running.';
    errorMsg.classList.remove('hidden');
  }
}

// Stage 1: send OTP
async function handleSendOtp(errorMsg, submitBtn) {

  let password = document.getElementById('password').value;
  let confirmPassword = document.getElementById('confirmPassword').value;

  if (password !== confirmPassword) {
    errorMsg.textContent = 'Passwords do not match.';
    errorMsg.classList.remove('hidden');
    return;
  }
  
  const email = document.getElementById('email').value.trim();
  if (!email) {
    errorMsg.textContent = 'Enter your email first.';
    errorMsg.classList.remove('hidden');
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = 'Sending OTP...';

  try {
    const res = await fetch('/api/request-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    const data = await res.json();

    if (res.ok) {
      registerStage = 'otp_sent';
      submitBtn.textContent = 'Verify OTP';
    } else {
      errorMsg.textContent = data.message || 'Failed to send OTP.';
      errorMsg.classList.remove('hidden');
      submitBtn.textContent = 'Send OTP';
    }
  } catch (err) {
    errorMsg.textContent = 'Server unreachable.';
    errorMsg.classList.remove('hidden');
    submitBtn.textContent = 'Send OTP';
  }
  submitBtn.disabled = false;
}

// Stage 2: verify OTP
async function handleVerifyOtp(errorMsg, submitBtn) {
  const email = document.getElementById('email').value.trim();
  const otp = document.getElementById('otp').value.trim();
  if (!otp) {
    errorMsg.textContent = 'Enter the OTP sent to your email.';
    errorMsg.classList.remove('hidden');
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = 'Verifying...';

  try {
    const res = await fetch('/api/verify-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, otp })
    });
    const data = await res.json();

    if (res.ok) {
      registerStage = 'otp_verified';
      submitBtn.textContent = 'Create Account & Continue';
    } else {
      errorMsg.textContent = data.message || 'Invalid or expired OTP.';
      errorMsg.classList.remove('hidden');
      submitBtn.textContent = 'Verify OTP';
    }
  } catch (err) {
    errorMsg.textContent = 'Server unreachable.';
    errorMsg.classList.remove('hidden');
    submitBtn.textContent = 'Verify OTP';
  }
  submitBtn.disabled = false;
}

// Stage 3: actually register
async function handleRegister(errorMsg) {
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;
  const confirmPassword = document.getElementById('confirmPassword').value;
  const email = document.getElementById('email').value.trim();

  if (password !== confirmPassword) {
    errorMsg.textContent = 'Passwords do not match.';
    errorMsg.classList.remove('hidden');
    return;
  }

  try {
    const res = await fetch('/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, email })
    });
    const data = await res.json();

    if (res.ok) {
      localStorage.setItem('user', JSON.stringify(data.user));
      window.location.href = '/profile_setup.html';
    } else {
      errorMsg.textContent = data.message || 'Registration failed.';
      errorMsg.classList.remove('hidden');
    }
  } catch (err) {
    errorMsg.textContent = 'Server unreachable. Make sure node server.js is running.';
    errorMsg.classList.remove('hidden');
  }
}