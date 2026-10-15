const fs = require('fs'), path = require('path');
const S = path.join(__dirname, 'src');
const head = fs.readFileSync(path.join(S, '00_head.html'), 'utf8');
const js = fs.readdirSync(S).filter(f => /^\d\d_.*\.js$/.test(f)).sort().map(f => '/* ---- ' + f + ' ---- */\n' + fs.readFileSync(path.join(S, f), 'utf8')).join('\n');
const body = head + '\n<script>\n(function () {\n' + js + '\n})();\n</script>\n';
fs.mkdirSync(path.join(__dirname, 'dist'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'dist', 'artifact.html'), body);
const full = '<!doctype html>\n<html lang="en-AU">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n<meta name="description" content="A 3D fishing game on real south-east Queensland piers, with live weather and tide, Qld size limits and nearby boat hire prices.">\n' +
  head.replace(/<canvas id="c"[\s\S]*$/, '') + '</head>\n<body>\n' + head.slice(head.indexOf('<canvas id="c"')) + '\n<script>\n(function () {\n' + js + '\n})();\n</script>\n</body>\n</html>\n';
fs.writeFileSync(path.join(__dirname, 'index.html'), full);
console.log('built', (body.length / 1024).toFixed(0) + 'KB');
