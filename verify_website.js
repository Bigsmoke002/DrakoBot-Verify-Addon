const express = require('express');
const bodyParser = require('body-parser');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// ─────────────────────────────────────────────────────────
// Config laden oder erstellen
// ─────────────────────────────────────────────────────────
const configPath = path.join(__dirname, 'verify_config.json');
let config = {
  port: 8084,
  role: "",
  verifyLink: "http://localhost:8084",
  verificationLevel: 4,
  joinRole: "",
  redirectLink: "https://discord.com/channels/@me"
};

if (!fs.existsSync(configPath)) {
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
  console.log('Keine verify_config.json gefunden. Standardwerte erstellt.');
} else {
  try {
    const raw = fs.readFileSync(configPath, 'utf8');
    const userConfig = JSON.parse(raw);
    config = { ...config, ...userConfig };
  } catch (err) {
    console.error('Fehler beim Lesen der verify_config.json:', err.message);
  }
}

// Helper-Funktion zum Formatieren des Datums
function formatDate(dateInput) {
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return 'unknown';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');
  return `${day}.${month}.${year} ${hours}:${minutes}:${seconds}`;
}

// Helper-Funktion, um Benutzereingaben für HTML zu escapen
function escapeHTML(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

const app = express();
const port = config.port || 8084;

// Proxy-Vertrauen auf spezifische Header beschränken (sicherer als trust proxy true)
app.set('trust proxy', ['loopback', 'linklocal', 'uniquelocal']);

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// Einfache Rate-Limiting-Funktion ohne externe Abhängigkeiten
const ipRequestCounts = new Map();
const RATE_LIMIT = {
  windowMs: 15 * 60 * 1000, // 15 Minuten
  max: 100, // Anfragen pro IP
  resetTime: Date.now() + (15 * 60 * 1000)
};

setInterval(() => {
  // Alle 15 Minuten die Rate-Limit-Zähler zurücksetzen
  ipRequestCounts.clear();
  RATE_LIMIT.resetTime = Date.now() + RATE_LIMIT.windowMs;
}, RATE_LIMIT.windowMs);

// Middleware für Rate-Limiting
app.use((req, res, next) => {
  const ip = req.ip || req.socket.remoteAddress;
  if (!ipRequestCounts.has(ip)) {
    ipRequestCounts.set(ip, 1);
  } else {
    const count = ipRequestCounts.get(ip) + 1;
    ipRequestCounts.set(ip, count);
    
    if (count > RATE_LIMIT.max) {
      const resetInSeconds = Math.ceil((RATE_LIMIT.resetTime - Date.now()) / 1000);
      res.set('Retry-After', resetInSeconds.toString());
      return res.status(429).send('Zu viele Anfragen. Bitte versuche es später erneut.');
    }
  }
  next();
});

// Security-Header ohne helmet-Abhängigkeit
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-XSS-Protection': '1; mode=block',
    'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self';",
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer-when-downgrade'
  });
  next();
});

// HTTPS Prüfung
app.use((req, res, next) => {
  // Prüfen, ob über Proxy/Load Balancer bereits auf HTTPS weitergeleitet wurde
  const isSecure = req.secure || req.headers['x-forwarded-proto'] === 'https';
  
  // Im Produktionsmodus auf HTTPS bestehen, im Entwicklungsmodus erlauben
  if (process.env.NODE_ENV === 'production' && !isSecure) {
    return res.status(403).send('HTTPS erforderlich. Bitte verwende eine sichere Verbindung.');
  }
  next();
});

const dataDir = path.join(__dirname, 'verify_data');

// Eingaben, die in Dateinamen landen, streng prüfen
function isValidUserId(id) {
  return typeof id === 'string' && /^\d{17,20}$/.test(id);
}
function isValidChallenge(id) {
  return typeof id === 'string' && /^[0-9a-fA-F-]{36}$/.test(id);
}
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir);
}

app.get('/verify', (req, res) => {
  try {
    if (!isValidUserId(req.query.user) || !isValidChallenge(req.query.challenge)) {
      return res.status(400).send('Invalid verification link.');
    }
    const user = escapeHTML(req.query.user || 'Unknown');
    const challenge = escapeHTML(req.query.challenge || 'Unknown');
    const lang = req.query.lang === 'de' ? 'de' : 'en';
    const ip = escapeHTML(req.ip || req.socket.remoteAddress);
    let userAgent = req.headers['user-agent'] || 'Unknown';
    if (userAgent.length > 500) {
      userAgent = userAgent.substring(0, 500);
    }
    userAgent = escapeHTML(userAgent);

    // Generiere Token, der hier sofort angezeigt wird
    const token = crypto.randomBytes(16).toString('hex');

    const title = lang === 'de' ? 'Verifizierung' : 'Verification';
    const userIdText = lang === 'de' ? 'Benutzer-ID' : 'User ID';
    const challengeText = lang === 'de' ? 'Challenge-ID' : 'Challenge ID';
    const ipText = lang === 'de' ? 'Deine IP' : 'Your IP';
    const browserText = lang === 'de' ? 'Dein Browser' : 'Your Browser';
    const consentText = lang === 'de' ? 'Ich stimme der Datenschutzerklärung zu.' : 'I agree to the privacy policy.';
    const rulesText = lang === 'de' ? 'Ich akzeptiere die Regeln.' : 'I accept the rules.';
    const consentInstruction = lang === 'de'
      ? 'Wir sammeln diese Daten (IP-Adresse, Browser-Informationen) ausschließlich zu Verifizierungszwecken. Bitte bestätige, dass du unserer Datenschutzerklärung zustimmst.'
      : 'We collect this data (IP address, browser info) solely for verification purposes. Please confirm that you agree with our privacy policy.';
    const submitLabel = lang === 'de' ? 'Absenden' : 'Submit';

    const privacyButtonLabel = lang === 'de' ? 'Datenschutzinformationen anzeigen' : 'Show Privacy Policy';

    const privacyText = lang === 'de'
      ? `<strong>Transparenz und Information:</strong> Es werden folgende Daten erhoben: IP-Adresse, Browserinformationen und ein Token, das für die Authentifizierung und Sicherheit dient. Diese Daten werden ausschließlich dazu verwendet, sicherzustellen, dass sich User nicht mit unzähligen Accounts anmelden und Bots oder Betrüger andere Personen auf Discord nicht scamen.<br><br>
<strong>Speicherung:</strong> Die Daten werden als Datei auf dem Server gespeichert, auf dem der Bot läuft, und nicht an Dritte weitergegeben.<br><br>
<strong>Datenlöschung:</strong> Die Daten werden solange gespeichert, bis der User den Discord-Server verlässt oder der Befehl <code>/unverify</code> betätigt wird, der alle gespeicherten Informationen löscht.`
      : `<strong>Transparency and Information:</strong> The following data is collected: IP address, browser information, and a token used for authentication and security. This data is solely used to ensure that users cannot sign up with countless accounts and to prevent bots or scammers from targeting other individuals on Discord.<br><br>
<strong>Storage:</strong> The data is stored as a file on the server the bot runs on and is not shared with third parties.<br><br>
<strong>Data Deletion:</strong> The data is retained until the user leaves the Discord server or the <code>/unverify</code> command is executed, which deletes all stored information.`;

    res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <meta http-equiv="X-UA-Compatible" content="ie=edge">
          <title>${title}</title>
          <style>
            body {
              background-color: #121212;
              color: #e0e0e0;
              font-family: Arial, sans-serif;
              margin: 0;
              padding: 0;
              display: flex;
              align-items: center;
              justify-content: center;
              height: 100vh;
            }
            .container {
              background: #1e1e1e;
              padding: 30px;
              border-radius: 10px;
              box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
              max-width: 500px;
              width: 90%;
              text-align: center;
            }
            h1 { margin-bottom: 20px; color: #ffffff; }
            p { font-size: 18px; line-height: 1.6; }
            label { font-size: 18px; }
            input[type="checkbox"] { transform: scale(1.5); margin-right: 10px; }
            button {
              background-color: #4CAF50;
              border: none;
              border-radius: 4px;
              color: #fff;
              cursor: pointer;
              font-size: 18px;
              margin-top: 20px;
              padding: 12px 24px;
            }
            button:hover { background-color: #45a049; }
            #privacyInfo {
              display: none;
              background: #222;
              padding: 20px;
              border-radius: 5px;
              margin-top: 20px;
              text-align: left;
              font-size: 16px;
            }
            #togglePrivacy {
              margin-top: 20px;
              font-size: 16px;
              background-color: #555;
            }
            .token-display {
              font-family: monospace;
              background: #333;
              color: #fff;
              padding: 15px;
              border-radius: 4px;
              margin-bottom: 20px;
              font-size: 20px;
              word-break: break-all;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>${title}</h1>
            <p><strong>${userIdText}:</strong> ${user}</p>
            <p><strong>${challengeText}:</strong> ${challenge}</p>
            <p><strong>${ipText}:</strong> ${ip}</p>
            <p><strong>${browserText}:</strong> ${userAgent}</p>
            <p>${consentInstruction}</p>
            <p><strong>${lang === 'de' ? 'Dein Token:' : 'Your Token:'}</strong></p>
            <div class="token-display">${token}</div>
            <form action="/submit" method="post">
              <input type="hidden" name="user" value="${user}">
              <input type="hidden" name="challenge" value="${challenge}">
              <input type="hidden" name="ip" value="${ip}">
              <input type="hidden" name="userAgent" value="${userAgent}">
              <input type="hidden" name="lang" value="${lang}">
              <input type="hidden" name="token" value="${token}">
              <label>
                <input type="checkbox" name="consent" required> ${consentText}
              </label>
              <br><br>
              <label>
                <input type="checkbox" name="rules" required> ${rulesText}
              </label>
              <br><br>
              <button type="submit">${submitLabel}</button>
            </form>
            <button id="togglePrivacy" onclick="togglePrivacy()">${privacyButtonLabel}</button>
            <div id="privacyInfo">${privacyText}</div>
            <script>
              function togglePrivacy() {
                var x = document.getElementById('privacyInfo');
                if (x.style.display === "none" || x.style.display === "") {
                  x.style.display = "block";
                } else {
                  x.style.display = "none";
                }
              }
            </script>
          </div>
        </body>
      </html>
    `);
  } catch (error) {
    console.error('Fehler in /verify-Route:', error.message);
    const errorMsg = req.query.lang === 'de' 
      ? 'Ein Fehler ist aufgetreten. Bitte versuche es später erneut.' 
      : 'An error occurred. Please try again later.';
    res.status(500).send(errorMsg);
  }
});

app.post('/submit', (req, res) => {
  try {
    const { user, challenge, consent, rules, lang, token } = req.body;
    // IP und User-Agent serverseitig ermitteln statt aus dem (fälschbaren) Formular
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'] || 'Unknown';
    const language = lang === 'de' ? 'de' : 'en';
    
    // Validierung der Eingaben
    // Nur echte Discord-IDs / UUIDs / Hex-Tokens zulassen (verhindert Path Traversal beim Dateinamen)
    if (!isValidUserId(user) || !isValidChallenge(challenge) || !/^[a-f0-9]{32}$/.test(token || '')) {
      const message = language === 'de'
        ? 'Fehlende Daten für die Verifizierung.'
        : 'Missing data for verification.';
      return res.status(400).send(message);
    }
    
    if (!consent || !rules) {
      const message = language === 'de'
        ? 'Du musst der Datenschutzerklärung zustimmen und die Regeln akzeptieren, um fortzufahren.'
        : 'You must agree to the privacy policy and accept the rules to proceed.';
      return res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <title>${language === 'de' ? 'Verifizierung Fehlgeschlagen' : 'Verification Failed'}</title>
          <style>
            body { background-color: #121212; color: #e0e0e0; font-family: Arial, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; }
            .container { text-align: center; }
          </style>
        </head>
        <body>
          <div class="container">
            <p>${message}</p>
          </div>
        </body>
        </html>
      `);
    }
    
    const now = new Date();
    const rulesAcceptedAt = formatDate(now);
    const joinedAt = formatDate(now);
    const verifiedAt = formatDate(now);

    // Sicherer Umgang mit Benutzerdaten
    const cleanUser = escapeHTML(user);
    const cleanIp = escapeHTML(ip);
    const cleanUserAgent = escapeHTML(userAgent.substring(0, 500));

    const data = {
      user: cleanUser,
      challenge,
      ip: cleanIp,
      userAgent: cleanUserAgent,
      consent: true,
      rulesAcceptedAt,
      joinedAt,
      verifiedAt,
      token
    };

    // Sicherstellen, dass das Verzeichnis existiert
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    const filePath = path.join(dataDir, `${cleanUser}.json`);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');

    const title = language === 'de' ? 'Verifizierung Erfolgreich' : 'Verification Successful';
    const successText = language === 'de'
      ? 'Deine Daten wurden erfolgreich gespeichert.'
      : 'Your data has been successfully saved.';
    
    // Nutze den redirectLink aus der Config
    const redirectLink = config.redirectLink || 'https://discord.com/channels/@me';

    const redirectText = language === 'de'
      ? 'In <span id="countdown">5</span> Sekunden wirst du weitergeleitet!'
      : 'In <span id="countdown">5</span> seconds, you will be redirected!';
      
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="X-UA-Compatible" content="ie=edge">
        <title>${title}</title>
        <style>
          body {
            background-color: #121212;
            color: #e0e0e0;
            font-family: Arial, sans-serif;
            margin: 0;
            padding: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100vh;
          }
          .container {
            background: #1e1e1e;
            padding: 30px;
            border-radius: 10px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
            max-width: 500px;
            width: 90%;
            text-align: center;
          }
          h1 { color: #ffffff; }
          p { font-size: 18px; margin: 15px 0; }
          .redirect-message {
            font-size: 32px;
            color: #40E0D0;
            font-weight: bold;
            margin-top: 30px;
          }
          .countdown {
            font-size: 28px;
            color: #40E0D0;
            font-weight: bold;
          }
        </style>
        <script>
          let seconds = 5;
          function countdown() {
            document.getElementById('countdown').innerText = seconds;
            if(seconds <= 0) {
              window.location.href = "${redirectLink}";
            } else {
              seconds--;
              setTimeout(countdown, 1000);
            }
          }
          window.onload = countdown;
        </script>
      </head>
      <body>
        <div class="container">
          <h1>${title}!</h1>
          <p>${successText}</p>
          <p class="redirect-message">${redirectText}</p>
        </div>
      </body>
      </html>
    `);
  } catch (error) {
    console.error('Fehler in /submit-Route:', error.message);
    const errorMsg = req.body.lang === 'de' 
      ? 'Ein Fehler ist aufgetreten. Bitte versuche es später erneut.' 
      : 'An error occurred. Please try again later.';
    res.status(500).send(errorMsg);
  }
});

// Allgemeiner Fehlerhandler
app.use((err, req, res, next) => {
  console.error('Unbehandelter Fehler:', err.message);
  const language = req.query.lang === 'de' || req.body.lang === 'de' ? 'de' : 'en';
  const errorMsg = language === 'de'
    ? 'Ein unerwarteter Fehler ist aufgetreten. Bitte versuche es später erneut.'
    : 'An unexpected error occurred. Please try again later.';
  res.status(500).send(errorMsg);
});

// 404-Handler
app.use((req, res) => {
  const language = req.query.lang === 'de' || req.body.lang === 'de' ? 'de' : 'en';
  const notFoundMsg = language === 'de'
    ? 'Seite nicht gefunden. Bitte prüfe die URL und versuche es erneut.'
    : 'Page not found. Please check the URL and try again.';
  res.status(404).send(notFoundMsg);
});

app.listen(port, () => {
  console.log(`Verify website is running on port ${port}`);
});

// Graceful Shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM Signal erhalten. Server wird heruntergefahren...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT Signal erhalten. Server wird heruntergefahren...');
  process.exit(0);
});