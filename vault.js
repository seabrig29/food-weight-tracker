const vaultStorageKey = 'food-weight-tracker-v1';
const autoSyncStorageKey = 'food-weight-tracker-auto-sync-v1';
const hostedVaultUrl = 'https://www.folkbandura.com/private/food-tracker-sync.php';
const vaultStatus = document.querySelector('#vaultStatus');
const vaultPassphraseInput = document.querySelector('#vaultPassphrase');
const syncPassphraseInput = document.querySelector('#syncPassphrase');
const autoSyncInput = document.querySelector('#autoSync');
const toBase64 = bytes => btoa(String.fromCharCode(...bytes));
const fromBase64 = text => Uint8Array.from(atob(text), char => char.charCodeAt(0));
let syncTimer;
let syncInProgress = false;

const restoredStatus = sessionStorage.getItem('food-weight-tracker-vault-status');
if (restoredStatus) {
  vaultStatus.textContent = restoredStatus;
  sessionStorage.removeItem('food-weight-tracker-vault-status');
}

function savedAutoSyncCredentials() {
  try { return JSON.parse(localStorage.getItem(autoSyncStorageKey) || 'null'); } catch { return null; }
}

async function vaultKey(passphrase, salt) {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 250000, hash: 'SHA-256' }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

function downloadVault(contents) {
  const link = document.createElement('a');
  const url = URL.createObjectURL(new Blob([contents], { type: 'application/json' }));
  link.href = url;
  link.download = 'food-tracker-vault.enc';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

async function createVaultText(passphrase) {
  const data = localStorage.getItem(vaultStorageKey);
  if (passphrase.length < 6) throw new Error('Use a vault passphrase of at least 6 characters.');
  if (!data) throw new Error('There is no tracker data to encrypt yet.');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await vaultKey(passphrase, salt);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(data));
  return JSON.stringify({ version: 1, kdf: 'PBKDF2-SHA-256', iterations: 250000, salt: toBase64(salt), iv: toBase64(iv), ciphertext: toBase64(new Uint8Array(ciphertext)) });
}

async function decryptVaultText(text, passphrase) {
  let vault;
  try { vault = JSON.parse(text); } catch { throw new Error('The vault file is not valid encrypted tracker data.'); }
  if (vault.version !== 1 || !vault.salt || !vault.iv || !vault.ciphertext) throw new Error('The vault file has an unrecognized format.');
  let key;
  try { key = await vaultKey(passphrase, fromBase64(vault.salt)); } catch { throw new Error('The vault encryption information is invalid.'); }
  let plain;
  try { plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(vault.iv) }, key, fromBase64(vault.ciphertext)); } catch { throw new Error('This passphrase does not unlock the cloud vault.'); }
  let state;
  try { state = JSON.parse(new TextDecoder().decode(plain)); } catch { throw new Error('The unlocked vault does not contain readable tracker data.'); }
  if (!state.days || !Array.isArray(state.foods)) throw new Error('The unlocked vault is missing tracker data.');
  return state;
}

async function restoreVaultText(text, passphrase, successMessage) {
  const state = await decryptVaultText(text, passphrase);
  localStorage.setItem(vaultStorageKey, JSON.stringify(state));
  if (successMessage) sessionStorage.setItem('food-weight-tracker-vault-status', successMessage);
  location.reload();
}

function enteredCredentials() {
  return { vaultPassphrase: vaultPassphraseInput.value, syncPassphrase: syncPassphraseInput.value };
}

async function saveHostedVault({ quiet = false } = {}) {
  if (syncInProgress) return;
  const { vaultPassphrase, syncPassphrase } = enteredCredentials();
  if (!syncPassphrase) throw new Error('Enter the sync password first.');
  syncInProgress = true;
  if (!quiet) vaultStatus.textContent = 'Encrypting and saving your current history…';
  try {
    const response = await fetch(hostedVaultUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Food-Tracker-Sync-Key': syncPassphrase }, body: await createVaultText(vaultPassphrase) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `Could not save the cloud history (status ${response.status}).`);
    vaultStatus.textContent = quiet ? 'Automatically saved your latest changes to the cloud.' : 'Current history encrypted and saved to the cloud.';
  } finally {
    syncInProgress = false;
  }
}

async function loadHostedVault({ quiet = false } = {}) {
  if (syncInProgress) return;
  const { vaultPassphrase, syncPassphrase } = enteredCredentials();
  if (!vaultPassphrase || !syncPassphrase) throw new Error('Enter both passwords first.');
  syncInProgress = true;
  if (!quiet) vaultStatus.textContent = 'Loading encrypted cloud history…';
  try {
    const response = await fetch(hostedVaultUrl, { cache: 'no-store', headers: { 'X-Food-Tracker-Sync-Key': syncPassphrase } });
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      throw new Error(result.error || `The cloud history could not be downloaded (status ${response.status}).`);
    }
    await restoreVaultText(await response.text(), vaultPassphrase, 'Cloud history loaded successfully on this device.');
  } finally {
    syncInProgress = false;
  }
}

document.querySelector('#createVault').addEventListener('click', async () => {
  try {
    downloadVault(await createVaultText(vaultPassphraseInput.value));
    vaultStatus.textContent = 'Encrypted backup downloaded.';
    vaultPassphraseInput.value = '';
  } catch (error) { vaultStatus.textContent = error.message || 'Could not create the encrypted vault.'; }
});

document.querySelector('#restoreVault').addEventListener('click', async () => {
  const file = document.querySelector('#vaultFile').files[0];
  if (!file || !vaultPassphraseInput.value) { vaultStatus.textContent = 'Choose a vault file and enter its passphrase.'; return; }
  try { await restoreVaultText(await file.text(), vaultPassphraseInput.value); } catch (error) { vaultStatus.textContent = error.message || 'Could not unlock that vault.'; }
});

document.querySelector('#saveHostedVault').addEventListener('click', async () => {
  try { await saveHostedVault(); } catch (error) { vaultStatus.textContent = error.message || 'Could not save the cloud history.'; }
});

document.querySelector('#restoreHostedVault').addEventListener('click', async () => {
  try { await loadHostedVault(); } catch (error) { vaultStatus.textContent = error.message || 'Could not load the cloud history.'; }
});

autoSyncInput.addEventListener('change', async () => {
  if (!autoSyncInput.checked) {
    localStorage.removeItem(autoSyncStorageKey);
    vaultStatus.textContent = 'Automatic cloud sync is off on this device.';
    return;
  }
  const credentials = enteredCredentials();
  if (credentials.vaultPassphrase.length < 6 || !credentials.syncPassphrase) {
    autoSyncInput.checked = false;
    vaultStatus.textContent = 'Enter both passwords before turning on automatic sync.';
    return;
  }
  localStorage.setItem(autoSyncStorageKey, JSON.stringify(credentials));
  try { await loadHostedVault(); } catch (error) { vaultStatus.textContent = error.message || 'Could not start automatic cloud sync.'; }
});

window.addEventListener('food-tracker-state-saved', () => {
  if (!savedAutoSyncCredentials()) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => saveHostedVault({ quiet: true }).catch(error => { vaultStatus.textContent = error.message || 'Automatic cloud save failed.'; }), 900);
});

const autoCredentials = savedAutoSyncCredentials();
if (autoCredentials?.vaultPassphrase && autoCredentials?.syncPassphrase) {
  vaultPassphraseInput.value = autoCredentials.vaultPassphrase;
  syncPassphraseInput.value = autoCredentials.syncPassphrase;
  autoSyncInput.checked = true;
  vaultStatus.textContent = 'Loading your encrypted cloud history…';
  loadHostedVault({ quiet: true }).catch(error => { vaultStatus.textContent = error.message || 'Automatic cloud load failed.'; });
}
