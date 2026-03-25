// ============================================
// BSI ROADMAP — AUTH MODULE
// Blackforge Space Industries
// ============================================

// BSI Admin Credentials
// CHANGE THESE BEFORE DEPLOYING
const BSI_CREDENTIALS = {
    username: "nking",
    // Password is hashed — do not store plain text
    // Current password: BSI-0001 (change this)
    passwordHash: "e3b6b3e5c9e8f4d2a1b0c7f6e5d4c3b2a1f0e9d8c7b6a5f4e3d2c1b0a9f8e7d6",
    // MFA Secret — used to generate TOTP codes
    // This will be set during first login setup
    mfaSecret: null,
    mfaEnabled: false
};

// Session State
let currentSession = {
    isLoggedIn: false,
    isAdmin: false,
    isGuest: false,
    username: null
};

// ============================================
// SIMPLE HASH FUNCTION
// Not cryptographic — for basic protection only
// ============================================
async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// ============================================
// TOTP MFA FUNCTIONS
// Compatible with Google Authenticator
// ============================================

// Generate a random MFA secret
function generateMFASecret() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let secret = '';
    for (let i = 0; i < 32; i++) {
        secret += chars[Math.floor(Math.random() * chars.length)];
    }
    return secret;
}

// Base32 decode for TOTP
function base32Decode(base32) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let bits = '';
    for (const char of base32.toUpperCase()) {
        const val = chars.indexOf(char);
        if (val === -1) continue;
        bits += val.toString(2).padStart(5, '0');
    }
    const bytes = [];
    for (let i = 0; i + 8 <= bits.length; i += 8) {
        bytes.push(parseInt(bits.slice(i, i + 8), 2));
    }
    return new Uint8Array(bytes);
}

// Generate TOTP code
async function generateTOTP(secret) {
    const key = base32Decode(secret);
    const timeStep = Math.floor(Date.now() / 1000 / 30);
    const timeBuffer = new ArrayBuffer(8);
    const timeView = new DataView(timeBuffer);
    timeView.setUint32(4, timeStep, false);

    const cryptoKey = await crypto.subtle.importKey(
        'raw', key,
        { name: 'HMAC', hash: 'SHA-1' },
        false, ['sign']
    );

    const signature = await crypto.subtle.sign(
        'HMAC', cryptoKey, timeBuffer
    );

    const hmac = new Uint8Array(signature);
    const offset = hmac[hmac.length - 1] & 0xf;
    const code = (
        ((hmac[offset] & 0x7f) << 24) |
        ((hmac[offset + 1] & 0xff) << 16) |
        ((hmac[offset + 2] & 0xff) << 8) |
        (hmac[offset + 3] & 0xff)
    ) % 1000000;

    return code.toString().padStart(6, '0');
}

// Verify TOTP code — checks current and adjacent windows
async function verifyTOTP(secret, userCode) {
    for (let delta = -1; delta <= 1; delta++) {
        const timeStep = Math.floor(Date.now() / 1000 / 30) + delta;
        const timeBuffer = new ArrayBuffer(8);
        const timeView = new DataView(timeBuffer);
        timeView.setUint32(4, timeStep, false);

        const key = base32Decode(secret);
        const cryptoKey = await crypto.subtle.importKey(
            'raw', key,
            { name: 'HMAC', hash: 'SHA-1' },
            false, ['sign']
        );

        const signature = await crypto.subtle.sign(
            'HMAC', cryptoKey, timeBuffer
        );

        const hmac = new Uint8Array(signature);
        const offset = hmac[hmac.length - 1] & 0xf;
        const code = (
            ((hmac[offset] & 0x7f) << 24) |
            ((hmac[offset + 1] & 0xff) << 16) |
            ((hmac[offset + 2] & 0xff) << 8) |
            (hmac[offset + 3] & 0xff)
        ) % 1000000;

        if (code.toString().padStart(6, '0') === userCode) {
            return true;
        }
    }
    return false;
}

// ============================================
// MFA SETUP — FIRST TIME ONLY
// ============================================
async function setupMFA() {
    const stored = localStorage.getItem('bsi_mfa_secret');
    if (stored) {
        BSI_CREDENTIALS.mfaSecret = stored;
        BSI_CREDENTIALS.mfaEnabled = true;
        return;
    }

    // Generate new secret
    const secret = generateMFASecret();
    localStorage.setItem('bsi_mfa_secret', secret);
    BSI_CREDENTIALS.mfaSecret = secret;
    BSI_CREDENTIALS.mfaEnabled = true;

    // Generate QR code URL for Google Authenticator
    const qrURL = `otpauth://totp/BSI%20Roadmap:${BSI_CREDENTIALS.username}?secret=${secret}&issuer=BlackforgeSpaceIndustries`;
    const qrImageURL = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrURL)}`;

    // Show QR code to user
    const qrDiv = document.createElement('div');
    qrDiv.style.cssText = `
        position: fixed;
        top: 0; left: 0;
        width: 100%; height: 100%;
        background: rgba(0,0,0,0.95);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        z-index: 9999;
        font-family: 'Courier New', monospace;
        color: #e0e0e0;
        text-align: center;
        padding: 20px;
    `;
    qrDiv.innerHTML = `
        <h2 style="color:#ff6600;letter-spacing:0.3em;margin-bottom:8px">
            MFA SETUP REQUIRED
        </h2>
        <p style="color:#888;font-size:0.8rem;letter-spacing:0.1em;margin-bottom:24px">
            SCAN THIS CODE WITH GOOGLE AUTHENTICATOR
        </p>
        <img src="${qrImageURL}" 
             style="border:4px solid #ff6600;margin-bottom:24px" 
             alt="QR Code"/>
        <p style="color:#888;font-size:0.7rem;letter-spacing:0.1em;margin-bottom:8px">
            MANUAL ENTRY CODE:
        </p>
        <p style="color:#ff6600;font-size:0.9rem;letter-spacing:0.2em;margin-bottom:24px">
            ${secret}
        </p>
        <p style="color:#888;font-size:0.7rem;margin-bottom:24px;max-width:400px">
            After scanning, enter the 6-digit code from your 
            authenticator app to confirm setup.
        </p>
        <input type="text" 
               id="mfa-confirm-input"
               maxlength="6"
               placeholder="000000"
               style="
                   background:#222;
                   border:1px solid #333;
                   color:#e0e0e0;
                   padding:12px;
                   font-family:'Courier New',monospace;
                   font-size:1.2rem;
                   text-align:center;
                   letter-spacing:0.3em;
                   width:150px;
                   margin-bottom:16px;
                   outline:none;
               "/>
        <button id="mfa-confirm-btn"
                style="
                    background:#ff6600;
                    color:#000;
                    border:none;
                    padding:12px 32px;
                    font-family:'Courier New',monospace;
                    font-size:0.8rem;
                    font-weight:700;
                    letter-spacing:0.2em;
                    cursor:pointer;
                ">
            CONFIRM SETUP
        </button>
        <p id="mfa-setup-error" 
           style="color:#cc3333;font-size:0.7rem;margin-top:12px;min-height:20px">
        </p>
    `;

    document.body.appendChild(qrDiv);

    return new Promise((resolve) => {
        document.getElementById('mfa-confirm-btn').addEventListener('click', async () => {
            const code = document.getElementById('mfa-confirm-input').value;
            const valid = await verifyTOTP(secret, code);
            if (valid) {
                document.body.removeChild(qrDiv);
                resolve(true);
            } else {
                document.getElementById('mfa-setup-error').textContent = 
                    'INVALID CODE — TRY AGAIN';
            }
        });
    });
}

// ============================================
// LOGIN HANDLER
// ============================================
let loginStep = 'credentials';

async function handleLogin() {
    const errorEl = document.getElementById('login-error');
    errorEl.textContent = '';

    if (loginStep === 'credentials') {
        const username = document.getElementById('username').value.trim();
        const password = document.getElementById('password').value;

        if (!username || !password) {
            errorEl.textContent = 'ALL FIELDS REQUIRED';
            return;
        }

        // Check credentials
        const hash = await hashPassword(password);
        const storedHash = localStorage.getItem('bsi_password_hash');

        // First time setup
        if (!storedHash) {
            localStorage.setItem('bsi_password_hash', hash);
            localStorage.setItem('bsi_username', username);
        }

        const savedUsername = localStorage.getItem('bsi_username');
        const savedHash = localStorage.getItem('bsi_password_hash');

        if (username !== savedUsername || hash !== savedHash) {
            errorEl.style.color = '#cc3333';
            errorEl.textContent = 'INVALID CREDENTIALS';
            return;
        }

        // Check if MFA is set up
        const mfaSecret = localStorage.getItem('bsi_mfa_secret');
        if (!mfaSecret) {
            await setupMFA();
        } else {
            BSI_CREDENTIALS.mfaSecret = mfaSecret;
            BSI_CREDENTIALS.mfaEnabled = true;
        }

        // Show MFA input
        loginStep = 'mfa';
        document.getElementById('mfa-group').style.display = 'block';
        document.getElementById('login-btn').textContent = 'VERIFY CODE';
        errorEl.textContent = 'CREDENTIALS VERIFIED — ENTER AUTHENTICATOR CODE';
        errorEl.style.color = '#44aa44';
        return;
    }

    if (loginStep === 'mfa') {
        const code = document.getElementById('mfa-code').value.trim();
        if (!code || code.length !== 6) {
            errorEl.style.color = '#cc3333';
            errorEl.textContent = 'ENTER 6 DIGIT CODE';
            return;
        }

        const valid = await verifyTOTP(BSI_CREDENTIALS.mfaSecret, code);
        if (!valid) {
            errorEl.style.color = '#cc3333';
            errorEl.textContent = 'INVALID CODE — TRY AGAIN';
            return;
        }

        // Login successful
        currentSession = {
            isLoggedIn: true,
            isAdmin: true,
            isGuest: false,
            username: localStorage.getItem('bsi_username')
        };

        loginStep = 'credentials';
        showDashboard();
    }
}

// ============================================
// GUEST ACCESS
// ============================================
function handleGuestAccess() {
    currentSession = {
        isLoggedIn: true,
        isAdmin: false,
        isGuest: true,
        username: 'GUEST'
    };
    showDashboard();
}

// ============================================
// LOGOUT
// ============================================
function handleLogout() {
    currentSession = {
        isLoggedIn: false,
        isAdmin: false,
        isGuest: false,
        username: null
    };
    loginStep = 'credentials';
    document.getElementById('mfa-group').style.display = 'none';
    document.getElementById('login-btn').textContent = 'AUTHENTICATE';
    document.getElementById('username').value = '';
    document.getElementById('password').value = '';
    document.getElementById('mfa-code').value = '';
    const loginErrorEl = document.getElementById('login-error');
    loginErrorEl.textContent = '';
    loginErrorEl.style.color = '#cc3333';
    showScreen('login-screen');
}

// ============================================
// SCREEN MANAGEMENT
// ============================================
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
}

function showDashboard() {
    showScreen('dashboard-screen');
    document.getElementById('user-badge').textContent = 
        currentSession.isAdmin ? 
        `ADMIN // ${currentSession.username.toUpperCase()}` : 
        'GUEST // VIEW ONLY';

    if (currentSession.isAdmin) {
        document.querySelectorAll('.admin-only').forEach(el => {
            el.style.display = 'inline-block';
        });
    }

    // Initialize app
    if (typeof initApp === 'function') initApp();
}

// ============================================
// EVENT LISTENERS
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('login-btn')
        .addEventListener('click', handleLogin);

    document.getElementById('guest-btn')
        .addEventListener('click', handleGuestAccess);

    document.getElementById('logout-btn')
        .addEventListener('click', handleLogout);

    document.getElementById('password')
        .addEventListener('keypress', (e) => {
            if (e.key === 'Enter') handleLogin();
        });

    document.getElementById('mfa-code')
        .addEventListener('keypress', (e) => {
            if (e.key === 'Enter') handleLogin();
        });
});