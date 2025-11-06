const { app, BrowserWindow, BrowserView, ipcMain, globalShortcut, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const https = require('https');
const API_BASE_URL = 'http://192.168.1.25:3000'; // adapte plus tard avec l'IP de ton serveur

let mainWindow;
let contentView;
let staffWindow = null;

// 🔗 URLs à adapter si besoin
const URL_SITE = 'https://mon.myrealsim.com';
const URL_TRUCKERSMP = 'https://map.truckersmp.com/';

// 🔗 Webhook Discord (notifications)
// ➜ Mets ici ton URL de webhook, sinon laisse vide pour désactiver les notifs.
const DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/1434919505087430676/_FfrhQMUYRCdNYcsLA5m334sE6lLlq7eSvBjpluhp32R6w3laqNEjcwNgQXHXuh_9QCC'; // ex: 'https://discord.com/api/webhooks/xxx/yyy'

// -------------------
// Fonctions Webhook
// -------------------

function sendToDiscordWebhook(payload) {
  return new Promise((resolve, reject) => {
    if (!DISCORD_WEBHOOK_URL) {
      // Aucun webhook configuré => on ne fait rien
      return resolve({ status: 0, body: 'No webhook configured' });
    }

    try {
      const data = JSON.stringify(payload);
      const webhookUrl = new URL(DISCORD_WEBHOOK_URL);

      const options = {
        hostname: webhookUrl.hostname,
        path: webhookUrl.pathname + webhookUrl.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data)
        }
      };

      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => resolve({ status: res.statusCode, body }));
      });

      req.on('error', (err) => reject(err));

      req.write(data);
      req.end();
    } catch (e) {
      console.error('Erreur sendToDiscordWebhook :', e);
      resolve({ status: -1, body: 'Local error' });
    }
  });
}

// -------------------
// Gestion des tickets
// -------------------

function getTicketsFilePath() {
  const userData = app.getPath('userData');
  return path.join(userData, 'tickets.json');
}

function readTickets() {
  const filePath = getTicketsFilePath();
  if (!fs.existsSync(filePath)) {
    return [];
  }

  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error('Erreur lecture tickets.json :', e);
    return [];
  }
}

function writeTickets(tickets) {
  const filePath = getTicketsFilePath();
  try {
    fs.writeFileSync(filePath, JSON.stringify(tickets, null, 2), 'utf-8');
  } catch (e) {
    console.error('Erreur écriture tickets.json :', e);
  }
}

function findTicketById(tickets, id) {
  return tickets.find(t => t.id === id);
}

// -------------------
// fonction api
// -------------------

function apiRequest(method, route, body) {
  return new Promise((resolve, reject) => {
    try {
      const base = new URL(API_BASE_URL);
      const url = new URL(route, base);

      const data = body ? JSON.stringify(body) : null;

      const options = {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname + url.search,
        method,
        headers: {
          'Content-Type': 'application/json',
        }
      };

      if (data) {
        options.headers['Content-Length'] = Buffer.byteLength(data);
      }

      const lib = url.protocol === 'https:' ? require('https') : require('http');

      const req = lib.request(options, (res) => {
        let raw = '';
        res.on('data', chunk => raw += chunk);
        res.on('end', () => {
          try {
            const json = raw ? JSON.parse(raw) : {};
            resolve(json);
          } catch (e) {
            console.error('Erreur parse réponse API :', e, raw);
            reject(e);
          }
        });
      });

      req.on('error', (err) => {
        console.error('Erreur requête API :', err);
        reject(err);
      });

      if (data) {
        req.write(data);
      }
      req.end();
    } catch (e) {
      console.error('Erreur apiRequest :', e);
      reject(e);
    }
  });
}

// -------------------
// Fenêtres
// -------------------

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    autoHideMenuBar: true,
    backgroundColor: '#020617',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  // Vue de contenu (site / map / assistance utilisateur)
  contentView = new BrowserView({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.setBrowserView(contentView);

  const updateViewBounds = () => {
    if (!mainWindow || !contentView) return;
    const { width, height } = mainWindow.getContentBounds();
    const headerHeight = 60; // hauteur de ton header HTML (index.html)
    contentView.setBounds({
      x: 0,
      y: headerHeight,
      width,
      height: height - headerHeight
    });
  };

  updateViewBounds();
  mainWindow.on('resize', updateViewBounds);

  // Par défaut : ton site
  contentView.webContents.loadURL(URL_SITE);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createMainWindow();
  autoUpdater.checkForUpdatesAndNotify();
});


function createStaffWindow() {
  if (staffWindow && !staffWindow.isDestroyed()) {
    staffWindow.focus();
    return;
  }

  staffWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    autoHideMenuBar: true,
    backgroundColor: '#020617',
    title: 'Support Staff - MRS',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  staffWindow.loadFile(path.join(__dirname, 'staff.html'));

  staffWindow.on('closed', () => {
    staffWindow = null;
  });
}

// -------------------
// IPC (communication)
// -------------------

// Afficher ton site (fenêtre principale)
ipcMain.handle('show-site', () => {
  if (contentView) {
    contentView.webContents.loadURL(URL_SITE);
  }
});

// Afficher la map TruckersMP
ipcMain.handle('show-map', () => {
  if (contentView) {
    contentView.webContents.loadURL(URL_TRUCKERSMP);
  }
});

// Afficher l'assistance utilisateur (support.html)
ipcMain.handle('show-support', () => {
  if (contentView) {
    contentView.webContents.loadFile(path.join(__dirname, 'support.html'));
  }
});

// Création d'un ticket (côté joueur)
ipcMain.handle('submit-ticket', async (_event, ticketData) => {
  try {
    const pseudo  = ticketData?.pseudo  || '';
    const type    = ticketData?.type    || '';
    const message = ticketData?.message || '';
    const email   = ticketData?.email   || '';

    // 🔄 Envoi au serveur Node (server.js => tickets.db.json)
    const res = await apiRequest('POST', '/tickets', {
      pseudo,
      type,
      message,
      email
    });

    if (!res || !res.ok) {
      return { ok: false, error: res?.error || 'Erreur API (création ticket)' };
    }

    const ticket = res.ticket;
    const now = ticket.createdAt || new Date().toISOString();

    // 🔔 Webhook : nouveau ticket (on utilise les infos renvoyées par l’API)
    const embed = {
      title: '🎫 Nouveau ticket',
      description: ticket.message || 'Aucun message',
      fields: [
        { name: 'Joueur', value: ticket.pseudo || 'Inconnu', inline: true },
        { name: 'Type', value: ticket.type || 'Non précisé', inline: true },
        { name: 'ID ticket', value: String(ticket.id), inline: true }
      ],
      timestamp: now,
      color: 0x2563eb
    };

    sendToDiscordWebhook({ embeds: [embed] }).catch(err => {
      console.error('Erreur webhook (nouveau ticket) :', err);
    });

    return { ok: true, ticket };
  } catch (e) {
    console.error('Erreur submit-ticket :', e);
    return { ok: false, error: e.message || 'Erreur interne' };
  }
});

// Tickets d'un joueur (par pseudo)
ipcMain.handle('get-user-tickets', async (_event, { pseudo }) => {
  try {
    const pseudoParam = encodeURIComponent(pseudo || '');
    const res = await apiRequest('GET', `/tickets?pseudo=${pseudoParam}`);

    if (!res || !res.ok) {
      return { ok: false, error: res?.error || 'Erreur API (tickets joueur)' };
    }

    return { ok: true, tickets: res.tickets || [] };
  } catch (e) {
    console.error('Erreur get-user-tickets :', e);
    return { ok: false, error: e.message || 'Erreur interne' };
  }
});

// Tous les tickets (staff)
ipcMain.handle('get-all-tickets', async () => {
  try {
    const res = await apiRequest('GET', '/tickets');

    if (!res || !res.ok) {
      return { ok: false, error: res?.error || 'Erreur API (tous les tickets)' };
    }

    return { ok: true, tickets: res.tickets || [] };
  } catch (e) {
    console.error('Erreur get-all-tickets :', e);
    return { ok: false, error: e.message || 'Erreur interne' };
  }
});

// Récupérer un ticket par ID
ipcMain.handle('get-ticket', async (_event, { ticketId }) => {
  try {
    const res = await apiRequest('GET', `/tickets/${ticketId}`);

    if (!res || !res.ok) {
      return { ok: false, error: res?.error || 'Ticket introuvable' };
    }

    return { ok: true, ticket: res.ticket };
  } catch (e) {
    console.error('Erreur get-ticket :', e);
    return { ok: false, error: e.message || 'Erreur interne' };
  }
});

// Ajouter une réponse à un ticket (user ou staff)
ipcMain.handle('update-ticket-status', async (_event, { ticketId, status }) => {
  try {
    const res = await apiRequest('PATCH', `/tickets/${ticketId}/status`, { status });

    if (!res || !res.ok) {
      return { ok: false, error: res?.error || 'Erreur API (statut ticket)' };
    }

    const ticket = res.ticket;
    const statusLabel = {
      ouvert: 'Ouvert',
      en_cours: 'En cours',
      clos: 'Clos'
    }[ticket.status] || ticket.status;

    const embed = {
      title: '🔔 Statut du ticket mis à jour',
      fields: [
        { name: 'Ticket ID', value: String(ticket.id), inline: true },
        { name: 'Nouveau statut', value: statusLabel, inline: true },
        { name: 'Joueur', value: ticket.pseudo || 'Inconnu', inline: true }
      ],
      timestamp: ticket.updatedAt,
      color: ticket.status === 'clos' ? 0x22c55e : 0xeab308
    };

    sendToDiscordWebhook({ embeds: [embed] }).catch(err => {
      console.error('Erreur webhook (statut ticket) :', err);
    });

    return { ok: true, ticket };
  } catch (e) {
    console.error('Erreur update-ticket-status :', e);
    return { ok: false, error: e.message || 'Erreur interne' };
  }
});

// Assigner un ticket à un staff (prendre en charge)
ipcMain.handle('take-ticket', async (_event, { ticketId, staffName }) => {
  try {
    const res = await apiRequest('PATCH', `/tickets/${ticketId}/take`, {
      staffName
    });

    if (!res || !res.ok) {
      return { ok: false, error: res?.error || 'Erreur API (take ticket)' };
    }

    const ticket = res.ticket;

    const embed = {
      title: '👨‍💼 Ticket pris en charge',
      fields: [
        { name: 'Ticket ID', value: String(ticket.id), inline: true },
        { name: 'Staff', value: ticket.staff || 'Staff', inline: true },
        { name: 'Joueur', value: ticket.pseudo || 'Inconnu', inline: true }
      ],
      timestamp: ticket.updatedAt,
      color: 0x22c55e
    };

    sendToDiscordWebhook({ embeds: [embed] }).catch(err => {
      console.error('Erreur webhook (take ticket) :', err);
    });

    return { ok: true, ticket };
  } catch (e) {
    console.error('Erreur take-ticket :', e);
    return { ok: false, error: e.message || 'Erreur interne' };
  }
});

// -------------------
// Cycle de vie app
// -------------------

app.whenReady().then(() => {
  createMainWindow();

  // 🔐 Raccourci global pour la fenêtre staff, etc.
  globalShortcut.register('CommandOrControl+Shift+S', () => {
    createStaffWindow();
  });

  // 🔁 Auto-update
  initAutoUpdater();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});


// -------------------
// Auto-update (GitHub)
// -------------------

function initAutoUpdater() {
  console.log('[auto-updater] initAutoUpdater appelé, isPackaged =', app.isPackaged);

  // On n'active pas en mode développement
  if (!app.isPackaged) {
    console.log('[auto-updater] Mode développement, pas de mise à jour.');
    return;
  }

  // Config de base
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = false; // on contrôle nous-mêmes

  autoUpdater.on('checking-for-update', () => {
    console.log('[auto-updater] Vérification de mise à jour...');
  });

  autoUpdater.on('update-available', (info) => {
    console.log('[auto-updater] Mise à jour disponible :', info.version);
  });

  autoUpdater.on('update-not-available', (info) => {
    console.log('[auto-updater] Aucune mise à jour (version actuelle :', info.version, ')');
  });

  autoUpdater.on('error', (err) => {
    console.error('[auto-updater] Erreur :', err);
  });

  autoUpdater.on('download-progress', (progress) => {
    console.log(`[auto-updater] Download ${Math.round(progress.percent)}%`);
  });

  autoUpdater.on('update-downloaded', async (info) => {
    console.log('[auto-updater] Mise à jour téléchargée :', info.version);

    const result = await dialog.showMessageBox({
      type: 'question',
      buttons: ['Redémarrer maintenant', 'Plus tard'],
      defaultId: 0,
      cancelId: 1,
      title: 'Mise à jour disponible',
      message: 'Une nouvelle version du launcher MRS a été téléchargée.',
      detail: `Version ${info.version} — le launcher doit redémarrer pour appliquer la mise à jour.`
    });

    if (result.response === 0) {
      console.log('[auto-updater] L’utilisateur a choisi de redémarrer maintenant.');
      autoUpdater.quitAndInstall();
    } else {
      console.log('[auto-updater] L’utilisateur a choisi “Plus tard”.');
    }
  });

  console.log('[auto-updater] Lancement de checkForUpdatesAndNotify()');
  autoUpdater.checkForUpdatesAndNotify();
}
