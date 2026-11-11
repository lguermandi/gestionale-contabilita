const AUTH_USERNAME_PROPERTY = 'APP_USERNAME';
const AUTH_SALT_PROPERTY = 'APP_PASSWORD_SALT';
const AUTH_HASH_PROPERTY = 'APP_PASSWORD_HASH';
const AUTH_SETUP_USERNAME_PROPERTY = 'APP_SETUP_USERNAME';
const AUTH_SETUP_PASSWORD_PROPERTY = 'APP_SETUP_PASSWORD';
const AUTH_HASH_ITERATIONS = 60000;
const AUTH_SESSION_SECONDS = 30 * 24 * 60 * 60;
const AUTH_SESSION_PREFIX = 'auth_';
const AUTH_SESSION_REFRESH_THRESHOLD_SECONDS = 7 * 24 * 60 * 60;
const AUTH_ATTEMPT_LIMIT = 10;
const AUTH_ATTEMPT_SECONDS = 900;

function login(username, password) {
  const normalizedUsername = String(username || '').trim();
  const normalizedPassword = String(password || '');
  if (normalizedUsername.length > 128 || normalizedPassword.length > 128) {
    throw new Error('Nome utente o password non validi.');
  }

  const properties = PropertiesService.getScriptProperties();
  const savedUsername = properties.getProperty(AUTH_USERNAME_PROPERTY);
  const salt = properties.getProperty(AUTH_SALT_PROPERTY);
  const savedHash = properties.getProperty(AUTH_HASH_PROPERTY);

  if (!savedUsername || !salt || !savedHash) {
    throw new Error('Accesso non configurato. Segui le istruzioni di configurazione.');
  }

  const attemptKey = `login_attempts_${sha256Hex_(normalizedUsername)}`;
  const cache = CacheService.getScriptCache();
  const attempts = Number(cache.get(attemptKey) || 0);
  if (attempts >= AUTH_ATTEMPT_LIMIT) {
    throw new Error('Troppi tentativi. Riprova tra 15 minuti.');
  }

  const candidateHash = derivePasswordHash_(normalizedPassword, salt);
  const valid = normalizedUsername === savedUsername && constantTimeEquals_(candidateHash, savedHash);
  if (!valid) {
    cache.put(attemptKey, String(attempts + 1), AUTH_ATTEMPT_SECONDS);
    throw new Error('Nome utente o password non validi.');
  }

  cache.remove(attemptKey);
  const token = Utilities.getUuid() + Utilities.getUuid();
  removeExpiredSessions_(properties);
  properties.setProperty(
    AUTH_SESSION_PREFIX + token,
    String(Date.now() + AUTH_SESSION_SECONDS * 1000)
  );
  return { token: token, expiresIn: AUTH_SESSION_SECONDS };
}

function logout(token) {
  if (typeof token === 'string' && /^[0-9a-f-]{72}$/i.test(token)) {
    PropertiesService.getScriptProperties().deleteProperty(AUTH_SESSION_PREFIX + token);
  }
}

function configureCredentials_() {
  const properties = PropertiesService.getScriptProperties();
  const username = String(properties.getProperty(AUTH_SETUP_USERNAME_PROPERTY) || '').trim();
  const password = String(properties.getProperty(AUTH_SETUP_PASSWORD_PROPERTY) || '');

  if (username.length < 3 || username.length > 128 || password.length < 12 || password.length > 128) {
    throw new Error('Imposta un nome utente da 3 a 128 caratteri e una password da 12 a 128 caratteri.');
  }

  const salt = Utilities.getUuid() + Utilities.getUuid();
  const hash = derivePasswordHash_(password, salt);

  properties.setProperties({
    [AUTH_USERNAME_PROPERTY]: username,
    [AUTH_SALT_PROPERTY]: salt,
    [AUTH_HASH_PROPERTY]: hash
  });
  properties.deleteProperty(AUTH_SETUP_USERNAME_PROPERTY);
  properties.deleteProperty(AUTH_SETUP_PASSWORD_PROPERTY);
}

function requireSession_(token) {
  if (typeof token !== 'string' || !/^[0-9a-f-]{72}$/i.test(token)) {
    throw new Error('SESSION_EXPIRED');
  }
  const properties = PropertiesService.getScriptProperties();
  const sessionKey = AUTH_SESSION_PREFIX + token;
  const expiresAt = Number(properties.getProperty(sessionKey));
  const now = Date.now();
  if (!Number.isFinite(expiresAt) || expiresAt <= now) {
    properties.deleteProperty(sessionKey);
    throw new Error('SESSION_EXPIRED');
  }
  if (expiresAt - now <= AUTH_SESSION_REFRESH_THRESHOLD_SECONDS * 1000) {
    properties.setProperty(sessionKey, String(now + AUTH_SESSION_SECONDS * 1000));
  }
}

function removeExpiredSessions_(properties) {
  const now = Date.now();
  const allProperties = properties.getProperties();
  Object.keys(allProperties).forEach(key => {
    if (!key.startsWith(AUTH_SESSION_PREFIX)) return;
    const expiresAt = Number(allProperties[key]);
    if (!Number.isFinite(expiresAt) || expiresAt <= now) {
      properties.deleteProperty(key);
    }
  });
}

function derivePasswordHash_(password, salt) {
  const key = Utilities.newBlob(password).getBytes();
  const block = Utilities.newBlob(salt).getBytes().concat([0, 0, 0, 1]);
  let current = Utilities.computeHmacSha256Signature(block, key);
  const result = current.slice();

  for (let iteration = 1; iteration < AUTH_HASH_ITERATIONS; iteration += 1) {
    current = Utilities.computeHmacSha256Signature(current, key);
    for (let index = 0; index < result.length; index += 1) {
      result[index] ^= current[index];
    }
  }

  return result.map(byte => (byte & 0xff).toString(16).padStart(2, '0')).join('');
}

function constantTimeEquals_(left, right) {
  if (left.length !== right.length) {
    return false;
  }
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function sha256Hex_(value) {
  return Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    value,
    Utilities.Charset.UTF_8
  ).map(byte => (byte & 0xff).toString(16).padStart(2, '0')).join('');
}
