const vaultStorageKey = 'food-weight-tracker-v1';
const hostedVaultUrl = 'https://www.folkbandura.com/private/food-tracker-sync.php';
const vaultStatus = document.querySelector('#vaultStatus');
const unlockScreen = document.querySelector('#unlockScreen');
const unlockForm = document.querySelector('#unlockForm');
const masterPassphraseInput = document.querySelector('#masterPassphrase');
const unlockStatus = document.querySelector('#unlockStatus');
const toBase64 = bytes => btoa(String.fromCharCode(...bytes));
const fromBase64 = text => Uint8Array.from(atob(text), char => char.charCodeAt(0));
let masterPassphrase = '';
let syncTimer;
let syncInProgress = false;
let syncEnabled = false;

async function vaultKey(passphrase, salt) {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 250000, hash: 'SHA-256' }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

async function createVaultText(passphrase) {
  const data = localStorage.getItem(vaultStorageKey);
  if (!data) throw new Error('There is no tracker data to encrypt yet.');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await vaultKey(passphrase, salt);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(data));
  return JSON.stringify({ version: 1, kdf: 'PBKDF2-SHA-256', iterations: 250000, salt: toBase64(salt), iv: toBase64(iv), ciphertext: toBase64(new Uint8Array(ciphertext)) });
}

async function decryptVaultText(text, passphrase) {
  let vault;
  try { vault = JSON.parse(text); } catch { throw new Error('The cloud history is not valid encrypted tracker data.'); }
  if (vault.version !== 1 || !vault.salt || !vault.iv || !vault.ciphertext) throw new Error('The cloud history has an unrecognized format.');
  let plain;
  try { plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(vault.iv) }, await vaultKey(passphrase, fromBase64(vault.salt)), fromBase64(vault.ciphertext)); } catch { throw new Error('That password does not unlock your history.'); }
  let loadedState;
  try { loadedState = JSON.parse(new TextDecoder().decode(plain)); } catch { throw new Error('The unlocked history is unreadable.'); }
  if (!loadedState.days || !Array.isArray(loadedState.foods)) throw new Error('The unlocked history is incomplete.');
  return loadedState;
}

async function saveHostedVault() {
  if (!masterPassphrase || syncInProgress) return;
  syncInProgress = true;
  try {
    const response = await fetch(hostedVaultUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Food-Tracker-Sync-Key': masterPassphrase }, body: await createVaultText(masterPassphrase) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `Cloud save failed (status ${response.status}).`);
    vaultStatus.textContent = 'Changes saved securely.';
  } catch (error) {
    vaultStatus.textContent = error.message || 'Automatic cloud save failed.';
  } finally {
    syncInProgress = false;
  }
}

async function unlockTracker(passphrase) {
  if (syncInProgress) return;
  syncInProgress = true;
  unlockStatus.textContent = 'Loading your encrypted history…';
  try {
    const response = await fetch(hostedVaultUrl, { cache: 'no-store', headers: { 'X-Food-Tracker-Sync-Key': passphrase } });
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      throw new Error(result.error || `Cloud history could not be downloaded (status ${response.status}).`);
    }
    const loadedState = await decryptVaultText(await response.text(), passphrase);
    masterPassphrase = passphrase;
    state = loadedState;
    localStorage.setItem(vaultStorageKey, JSON.stringify(state));
    render();
    syncEnabled = true;
    document.body.classList.remove('locked');
    unlockScreen.hidden = true;
    vaultStatus.textContent = 'History loaded. Changes save automatically.';
  } catch (error) {
    unlockStatus.textContent = error.message || 'Could not unlock your history.';
    masterPassphraseInput.select();
  } finally {
    syncInProgress = false;
  }
}

unlockForm.addEventListener('submit', async event => {
  event.preventDefault();
  const passphrase = masterPassphraseInput.value;
  if (passphrase.length < 6) { unlockStatus.textContent = 'Use a password of at least 6 characters.'; return; }
  await unlockTracker(passphrase);
});

window.addEventListener('food-tracker-state-saved', () => {
  if (!syncEnabled) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(saveHostedVault, 900);
});
