'use strict';
const { contextBridge } = require('electron');

// Lets the web app know it is running inside the Windows program, so it can hide the Google and Microsoft sign-in
// buttons (those need a real browser address) and keep to email sign-in.
contextBridge.exposeInMainWorld('smallMartDesktop', { platform: process.platform });
