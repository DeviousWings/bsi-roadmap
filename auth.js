// ============================================
// BSI ROADMAP — AUTH MODULE v2
// Blackforge Space Industries
// Credentials stored in private repo
// ============================================

// GitHub Configuration
const AUTH_CONFIG = {
  owner: "DeviousWings",
  privateRepo: "bsi-config",
  configFile: "config.json",
  getToken: () => localStorage.getItem("bsi_github_token"),
};

// Session State
let currentSession = {
  isLoggedIn: false,
  isAdmin: false,
  isGuest: false,
  username: null,
};

// Loaded config from private repo
let bsiConfig = null;

// ============================================
// LOAD CONFIG FROM PRIVATE REPO
// ============================================
async function loadConfig() {
  const token = AUTH_CONFIG.getToken();
  if (!token) {
    promptForToken();
    return false;
  }

  try {
    const response = await fetch(
      `https://api.github.com/repos/${AUTH_CONFIG.owner}/${AUTH_CONFIG.privateRepo}/contents/${AUTH_CONFIG.configFile}`,
      {
        headers: {
          Authorization: `token ${token}`,
          Accept: "application/vnd.github.v3+json",
        },
      },
    );

    if (!response.ok) throw new Error("Failed to load config");

    const result = await response.json();
    const decoded = atob(result.content.replace(/\n/g, ""));
    bsiConfig = JSON.parse(decoded);
    return true;
  } catch (error) {
    console.error("Config load error:", error);
    showError("AUTHENTICATION SYSTEM UNAVAILABLE");
    return false;
  }
}

// ============================================
// TOKEN PROMPT
// ============================================
function promptForToken() {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay active";
  overlay.innerHTML = `
        <div class="modal">
            <h3>BSI SYSTEM TOKEN REQUIRED</h3>
            <p style="color:#888;font-size:0.75rem;
                letter-spacing:0.1em;margin-bottom:16px">
                ENTER YOUR GITHUB ACCESS TOKEN TO AUTHENTICATE
            </p>
            <input type="password" 
                id="token-input" 
                placeholder="ghp_xxxxxxxxxxxx"
            />
            <div class="modal-actions">
                <button class="btn-primary" id="token-confirm">
                    CONFIRM
                </button>
            </div>
        </div>
    `;

  document.body.appendChild(overlay);

  document.getElementById("token-confirm").addEventListener("click", () => {
    const token = document.getElementById("token-input").value.trim();
    if (!token.startsWith("ghp_")) {
      alert("INVALID TOKEN FORMAT");
      return;
    }
    localStorage.setItem("bsi_github_token", token);
    document.body.removeChild(overlay);
    // Reload page to reinitialize with token
    window.location.reload();
  });
}

// ============================================
// HASH FUNCTION
// ============================================
async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ============================================
// TOTP FUNCTIONS
// ============================================
function base32Decode(base32) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const char of base32.toUpperCase()) {
    const val = chars.indexOf(char);
    if (val === -1) continue;
    bits += val.toString(2).padStart(5, "0");
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return new Uint8Array(bytes);
}

async function verifyTOTP(secret, userCode) {
  for (let delta = -1; delta <= 1; delta++) {
    const timeStep = Math.floor(Date.now() / 1000 / 30) + delta;
    const timeBuffer = new ArrayBuffer(8);
    const timeView = new DataView(timeBuffer);
    timeView.setUint32(4, timeStep, false);

    const key = base32Decode(secret);
    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      key,
      { name: "HMAC", hash: "SHA-1" },
      false,
      ["sign"],
    );

    const signature = await crypto.subtle.sign("HMAC", cryptoKey, timeBuffer);

    const hmac = new Uint8Array(signature);
    const offset = hmac[hmac.length - 1] & 0xf;
    const code =
      (((hmac[offset] & 0x7f) << 24) |
        ((hmac[offset + 1] & 0xff) << 16) |
        ((hmac[offset + 2] & 0xff) << 8) |
        (hmac[offset + 3] & 0xff)) %
      1000000;

    if (code.toString().padStart(6, "0") === userCode) {
      return true;
    }
  }
  return false;
}

// ============================================
// LOGIN HANDLER
// ============================================
let loginStep = "credentials";

async function handleLogin() {
  const errorEl = document.getElementById("login-error");
  errorEl.textContent = "";
  errorEl.style.color = "#cc3333";

  if (loginStep === "credentials") {
    const username = document.getElementById("username").value.trim();
    const password = document.getElementById("password").value;

    if (!username || !password) {
      errorEl.textContent = "ALL FIELDS REQUIRED";
      return;
    }

    // Load config from private repo
    const loaded = await loadConfig();
    if (!loaded) return;

    // Verify username
    if (username !== bsiConfig.username) {
      errorEl.textContent = "INVALID CREDENTIALS";
      resetLoginForm();
      return;
    }

    // Verify password
    const hash = await hashPassword(password);
    if (hash !== bsiConfig.passwordHash) {
      errorEl.textContent = "INVALID CREDENTIALS";
      resetLoginForm();
      return;
    }

    // Credentials valid — proceed to MFA
    loginStep = "mfa";
    document.getElementById("mfa-group").style.display = "block";
    document.getElementById("login-btn").textContent = "VERIFY CODE";
    errorEl.style.color = "#44aa44";
    errorEl.textContent = "CREDENTIALS VERIFIED — ENTER AUTHENTICATOR CODE";
    return;
  }

  if (loginStep === "mfa") {
    const code = document.getElementById("mfa-code").value.trim();

    if (!code || code.length !== 6) {
      errorEl.style.color = "#cc3333";
      errorEl.textContent = "ENTER 6 DIGIT CODE";
      return;
    }

    const valid = await verifyTOTP(bsiConfig.mfaSecret, code);
    if (!valid) {
      errorEl.style.color = "#cc3333";
      errorEl.textContent = "INVALID CODE — TRY AGAIN";
      document.getElementById("mfa-code").value = "";
      return;
    }

    // Full authentication successful
    currentSession = {
      isLoggedIn: true,
      isAdmin: true,
      isGuest: false,
      username: bsiConfig.username,
    };

    // Save session to localStorage
    localStorage.setItem(
      "bsi_session",
      JSON.stringify({
        isLoggedIn: true,
        isAdmin: true,
        isGuest: false,
        username: bsiConfig.username,
        timestamp: Date.now(),
      }),
    );

    loginStep = "credentials";
    showDashboard();
  }
}

// ============================================
// RESET LOGIN FORM
// ============================================
function resetLoginForm() {
  loginStep = "credentials";
  document.getElementById("mfa-group").style.display = "none";
  document.getElementById("login-btn").textContent = "AUTHENTICATE";
  document.getElementById("password").value = "";
  document.getElementById("mfa-code").value = "";
}

// ============================================
// GUEST ACCESS
// ============================================
function handleGuestAccess() {
  currentSession = {
    isLoggedIn: true,
    isAdmin: false,
    isGuest: true,
    username: "GUEST",
  };
  localStorage.setItem(
    "bsi_session",
    JSON.stringify({
      isLoggedIn: true,
      isAdmin: false,
      isGuest: true,
      username: "GUEST",
      timestamp: Date.now(),
    }),
  );
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
    username: null,
  };
  // Clear session
  localStorage.removeItem("bsi_session");
  bsiConfig = null;
  resetLoginForm();
  document.getElementById("username").value = "";
  document.getElementById("login-error").textContent = "";
  showScreen("login-screen");
}

// ============================================
// SHOW ERROR
// ============================================
function showError(message) {
  const errorEl = document.getElementById("login-error");
  if (errorEl) {
    errorEl.style.color = "#cc3333";
    errorEl.textContent = message;
  }
}

// ============================================
// SCREEN MANAGEMENT
// ============================================
function showScreen(screenId) {
  document
    .querySelectorAll(".screen")
    .forEach((s) => s.classList.remove("active"));
  document.getElementById(screenId).classList.add("active");
}

function showDashboard() {
  showScreen("dashboard-screen");
  document.getElementById("user-badge").textContent = currentSession.isAdmin
    ? `ADMIN // ${currentSession.username.toUpperCase()}`
    : "GUEST // VIEW ONLY";

  document.querySelectorAll(".admin-only").forEach((el) => {
    el.style.display = currentSession.isAdmin ? "inline-block" : "none";
  });

  if (typeof initApp === "function") initApp();
}

// ============================================
// EVENT LISTENERS
// ============================================
document.addEventListener("DOMContentLoaded", () => {
  // Event Listeners — always register these regardless of session state
  document.getElementById("login-btn").addEventListener("click", handleLogin);

  document
    .getElementById("guest-btn")
    .addEventListener("click", handleGuestAccess);

  document.getElementById("logout-btn").addEventListener("click", handleLogout);

  document.getElementById("password").addEventListener("keypress", (e) => {
    if (e.key === "Enter") handleLogin();
  });

  document.getElementById("mfa-code").addEventListener("keypress", (e) => {
    if (e.key === "Enter") handleLogin();
  });

  // Check for existing session
  const savedSession = localStorage.getItem("bsi_session");
  if (savedSession) {
    const session = JSON.parse(savedSession);
    // Session expires after 24 hours
    const age = Date.now() - session.timestamp;
    const maxAge = 24 * 60 * 60 * 1000;
    if (age < maxAge) {
      currentSession = session;
      showDashboard();
      return;
    } else {
      localStorage.removeItem("bsi_session");
    }
  }

  // Check for token on load
  const token = localStorage.getItem("bsi_github_token");
  if (!token) {
    promptForToken();
  }
});
