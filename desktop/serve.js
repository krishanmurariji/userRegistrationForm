'use strict';
const fs = require('node:fs');
const path = require('node:path');

/**
 * Finds the file to send for a request to the app's own address (app://localhost/...).
 * Returns an absolute path inside `root`, or null when there is nothing to send.
 *
 *  - A file that exists is sent as it is.
 *  - A path without a file extension is a screen of the app (for example /orders/123), which the app's own router
 *    shows, so index.html is sent.
 *  - A missing file with an extension is simply missing.
 *  - Nothing outside `root` can ever be reached, whatever the path contains.
 */
function resolveAppFile(root, requestPath) {
  let relative;
  try {
    relative = decodeURIComponent(requestPath);
  } catch {
    return null; // a broken %-sequence
  }
  if (relative.includes('\0')) return null;

  const base = path.resolve(root);
  // Normalising from "/" first removes every ".." that would climb above the root.
  const candidate = path.resolve(base, '.' + path.posix.normalize('/' + relative.replace(/\\/g, '/')));
  if (candidate !== base && !candidate.startsWith(base + path.sep)) return null;

  try {
    if (fs.statSync(candidate).isFile()) return candidate;
  } catch {
    // not there
  }
  return path.extname(relative) ? null : path.join(base, 'index.html');
}

module.exports = { resolveAppFile };
