const elements = {
  apiBase: document.getElementById('api-base'),
  accessToken: document.getElementById('access-token'),
  loadConsent: document.getElementById('load-consent'),
  grantConsent: document.getElementById('grant-consent'),
  revokeConsent: document.getElementById('revoke-consent'),
  consentBadge: document.getElementById('consent-badge'),
  consentUpdated: document.getElementById('consent-updated'),
  consentLog: document.getElementById('consent-log'),
  healthDot: document.getElementById('health-dot'),
  healthText: document.getElementById('health-text'),
  healthSubtext: document.getElementById('health-subtext'),
};

const state = {
  apiBase: import.meta.env.VITE_API_URL || 'https://localhost:3000',
  token: localStorage.getItem('ndli_access_token') || '',
};

function init() {
  elements.apiBase.value = state.apiBase;
  elements.accessToken.value = state.token;
  elements.apiBase.addEventListener('change', (e) => {
    state.apiBase = e.target.value.trim();
    pingBackend();
  });
  elements.accessToken.addEventListener('change', (e) => {
    state.token = e.target.value.trim();
    localStorage.setItem('ndli_access_token', state.token);
  });
  elements.loadConsent.addEventListener('click', fetchConsentStatus);
  elements.grantConsent.addEventListener('click', () => updateConsent(true));
  elements.revokeConsent.addEventListener('click', () => updateConsent(false));

  pingBackend();
  if (state.token) {
    fetchConsentStatus();
  } else {
    setHealthSubtext('Add an access token to manage consent.');
  }
}

async function pingBackend() {
  setHealthIndicator('checking');
  try {
    const res = await fetch(`${state.apiBase}/health`);
    const data = await res.json();
    setHealthIndicator('ok', data.message || 'Healthy');
  } catch (error) {
    console.error('Backend check failed', error);
    setHealthIndicator('bad', 'Backend unreachable');
  }
}

function setHealthIndicator(status, text = '') {
  elements.healthDot.className = `dot ${status === 'ok' ? 'ok' : status === 'bad' ? 'bad' : ''}`;
  elements.healthText.textContent = status === 'ok' ? 'Backend reachable' : status === 'bad' ? 'Backend unreachable' : 'Pinging backend…';
  setHealthSubtext(text);
}

function setHealthSubtext(text) {
  elements.healthSubtext.textContent = text;
}

function requireToken() {
  if (!state.token) {
    log('Token missing — add a JWT first');
    return false;
  }
  return true;
}

async function fetchConsentStatus() {
  if (!requireToken()) return;
  log('Fetching consent status…');
  try {
    const res = await fetch(`${state.apiBase}/health-profile`, {
      headers: {
        Authorization: `Bearer ${state.token}`,
      },
      credentials: 'include',
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const profile = await res.json();
    renderConsent(profile);
    log('Consent status refreshed');
  } catch (error) {
    console.error('Consent fetch failed', error);
    log('Could not load consent status');
  }
}

async function updateConsent(grant) {
  if (!requireToken()) return;
  const endpoint = grant ? 'consent' : 'revoke-consent';
  const verb = grant ? 'Granting' : 'Revoking';
  log(`${verb} consent…`);

  try {
    const res = await fetch(`${state.apiBase}/health-profile/${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${state.token}`,
      },
      credentials: 'include',
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const profile = await res.json();
    renderConsent(profile);
    log(`${grant ? 'Consent granted' : 'Consent revoked'} at ${formatTimestamp(profile.consentTimestamp)}`);
  } catch (error) {
    console.error('Consent update failed', error);
    log('Consent change failed — check token or API URL');
  }
}

function renderConsent(profile) {
  const active = Boolean(profile?.consentGiven);
  elements.consentBadge.textContent = active ? 'Consent active' : 'Consent not granted';
  elements.consentBadge.className = `badge ${active ? '' : 'off'}`;
  elements.consentUpdated.textContent = profile?.consentTimestamp
    ? formatTimestamp(profile.consentTimestamp)
    : 'Not recorded';
}

function formatTimestamp(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString();
}

function log(message) {
  const entry = document.createElement('div');
  entry.className = 'log-entry';
  entry.innerHTML = `<span>${new Date().toLocaleTimeString()}</span><span>${message}</span>`;
  elements.consentLog.prepend(entry);
}

init();
