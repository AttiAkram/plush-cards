'use strict';

const fs   = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../../../data/sessions');

function _ensureDir() {
  try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch {}
}

function _file(gmUsername) {
  return path.join(DATA_DIR, `${gmUsername.replace(/[^a-z0-9_-]/gi, '_')}.json`);
}

function saveSession(gmUsername, data) {
  _ensureDir();
  fs.writeFileSync(_file(gmUsername), JSON.stringify(data));
}

function loadSession(gmUsername) {
  try { return JSON.parse(fs.readFileSync(_file(gmUsername), 'utf8')); }
  catch { return null; }
}

function hasSession(gmUsername) {
  return fs.existsSync(_file(gmUsername));
}

function deleteSession(gmUsername) {
  try { fs.unlinkSync(_file(gmUsername)); } catch {}
}

module.exports = { saveSession, loadSession, hasSession, deleteSession };
