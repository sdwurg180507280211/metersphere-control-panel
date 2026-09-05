const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const version = String(process.argv[2] || '').trim().replace(/^desktop-v/i, '').replace(/^v/i, '');

if (!/^\d+\.\d+\.\d+$/.test(version)) {
  console.error('用法: npm run desktop:version -- 2.0.1');
  process.exit(1);
}

const files = [
  ['package.json', false],
  ['package-lock.json', true],
  ['frontend/package.json', false],
  ['frontend/package-lock.json', true]
];

for (const [relativePath, isLock] of files) {
  const filePath = path.join(root, relativePath);
  const json = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  json.version = version;
  if (isLock && json.packages?.['']) {
    json.packages[''].version = version;
  }
  fs.writeFileSync(filePath, `${JSON.stringify(json, null, 2)}\n`, 'utf8');
}

console.log(`Desktop 版本已更新为 ${version}`);
console.log('下一步:');
console.log(`  git add package.json package-lock.json frontend/package.json frontend/package-lock.json`);
console.log(`  git commit -m "chore(desktop): release v${version}"`);
console.log(`  git tag desktop-v${version}`);
console.log(`  git push origin desktop desktop-v${version}`);
