const vaultStorageKey = 'food-weight-tracker-v1';
const hostedVaultUrl = 'https://www.folkbandura.com/private/food-tracker-vault%20%281%29.enc';
const vaultStatus = document.querySelector('#vaultStatus');
const toBase64 = bytes => btoa(String.fromCharCode(...bytes));
const fromBase64 = text => Uint8Array.from(atob(text), char => char.charCodeAt(0));

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

async function decryptVaultText(text, passphrase) {
  let vault;
  try {
    vault = JSON.parse(text);
  } catch {
    throw new Error('The vault file is not valid encrypted tracker data.');
  }
  if (vault.version !== 1 || !vault.salt || !vault.iv || !vault.ciphertext) {
    throw new Error('The vault file has an unrecognized format.');
  }

  let key;
  try {
    key = await vaultKey(passphrase, fromBase64(vault.salt));
  } catch {
    throw new Error('The vault encryption information is invalid.');
  }

  let plain;
  try {
    plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(vault.iv) }, key, fromBase64(vault.ciphertext));
  } catch {
    throw new Error('This passphrase does not unlock the uploaded vault file.');
  }

  let state;
  try {
    state = JSON.parse(new TextDecoder().decode(plain));
  } catch {
    throw new Error('The unlocked vault does not contain readable tracker data.');
  }
  if (!state.days || !Array.isArray(state.foods)) {
    throw new Error('The unlocked vault is missing tracker data.');
  }
  return state;
}

async function restoreVaultText(text, passphrase) {
  const state = await decryptVaultText(text, passphrase);
  localStorage.setItem(vaultStorageKey, JSON.stringify(state));
  location.reload();
}

document.querySelector('#createVault').addEventListener('click', async () => {
  const passphrase = document.querySelector('#vaultPassphrase').value;
  const data = localStorage.getItem(vaultStorageKey);
  if (passphrase.length < 6) {
    vaultStatus.textContent = 'Use a passphrase of at least 6 characters.';
    return;
  }
  if (!data) {
    vaultStatus.textContent = 'There is no tracker data to encrypt yet.';
    return;
  }
  try {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await vaultKey(passphrase, salt);
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(data));
    downloadVault(JSON.stringify({ version: 1, kdf: 'PBKDF2-SHA-256', iterations: 250000, salt: toBase64(salt), iv: toBase64(iv), ciphertext: toBase64(new Uint8Array(ciphertext)) }));
    vaultStatus.textContent = 'Encrypted vault downloaded. Store it somewhere private, then upload that .enc file to your domain when ready.';
    document.querySelector('#vaultPassphrase').value = '';
  } catch {
    vaultStatus.textContent = 'Could not create the encrypted vault. Please try again.';
  }
});

document.querySelector('#restoreVault').addEventListener('click', async () => {
  const passphrase = document.querySelector('#vaultPassphrase').value;
  const file = document.querySelector('#vaultFile').files[0];
  if (!file || !passphrase) {
    vaultStatus.textContent = 'Choose a vault file and enter its passphrase.';
    return;
  }
  try {
    await restoreVaultText(await file.text(), passphrase);
  } catch (error) {
    vaultStatus.textContent = error.message || 'Could not unlock that vault.';
  }
});

document.querySelector('#restoreHostedVault').addEventListener('click', async () => {
  const passphrase = document.querySelector('#vaultPassphrase').value;
  if (!passphrase) {
    vaultStatus.textContent = 'Enter your vault passphrase first.';
    return;
  }
  vaultStatus.textContent = 'Downloading encrypted vault…';
  try {
    const response = await fetch(hostedVaultUrl, { cache: 'no-store' });
    if (!response.ok) throw new Error(`The hosted vault could not be downloaded (status ${response.status}).`);
    await restoreVaultText(await response.text(), passphrase);
  } catch (error) {
    vaultStatus.textContent = error.message || 'Could not unlock the hosted vault.';
  }
});
