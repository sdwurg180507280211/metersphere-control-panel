const fs = require('fs');
const path = require('path');

const PRIVATE_FILE_MODE = 0o600;
const PRIVATE_DIRECTORY_MODE = 0o700;

function ensureParentDirectory(filePath) {
  const directory = path.dirname(filePath);
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true, mode: PRIVATE_DIRECTORY_MODE });
  }
  return directory;
}

function secureFile(filePath) {
  if (process.platform !== 'win32' && fs.existsSync(filePath)) {
    fs.chmodSync(filePath, PRIVATE_FILE_MODE);
  }
}

function copyPrivateFile(source, destination) {
  ensureParentDirectory(destination);
  fs.copyFileSync(source, destination);
  secureFile(destination);
}

function writePrivateText(filePath, content) {
  ensureParentDirectory(filePath);
  fs.writeFileSync(filePath, content, {
    encoding: 'utf8',
    mode: PRIVATE_FILE_MODE
  });
  secureFile(filePath);
}

module.exports = {
  PRIVATE_FILE_MODE,
  ensureParentDirectory,
  secureFile,
  copyPrivateFile,
  writePrivateText
};
