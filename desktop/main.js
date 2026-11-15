'use strict';
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { app, BrowserWindow, Menu, net, protocol, shell } = require('electron');
const { resolveAppFile } = require('./serve');

// The app is served from its own address, app://localhost, so it behaves like a website (routes, storage and
// secure-context features all work) without running a web server. The API must allow this origin.
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

// When installed, the built web app is copied next to the program (see "extraResources" in package.json).
const webRoot = app.isPackaged
  ? path.join(process.resourcesPath, 'web')
  : path.join(__dirname, '..', 'app', 'dist', 'app', 'browser');

// Only one copy of the app runs: opening it again brings the first window forward.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  let window = null;

  app.on('second-instance', () => {
    if (!window) return;
    if (window.isMinimized()) window.restore();
    window.focus();
  });

  app.whenReady().then(() => {
    protocol.handle('app', (request) => {
      const file = resolveAppFile(webRoot, new URL(request.url).pathname);
      return file ? net.fetch(pathToFileURL(file).toString()) : new Response('Not found', { status: 404 });
    });
    if (app.isPackaged) Menu.setApplicationMenu(null);
    window = createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) window = createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 420,
    minHeight: 640,
    title: 'Small Mart',
    icon: path.join(__dirname, 'build', 'icon.png'),
    backgroundColor: '#f0f2f1',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Pages of other websites open in the person's browser, never inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (new URL(url).origin !== 'app://localhost') {
      event.preventDefault();
      if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
    }
  });

  void win.loadURL('app://localhost/');
  return win;
}
