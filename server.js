const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

loadEnvFile();

const port = Number(process.env.PORT || 3000);
const deepseekUrl = 'https://api.deepseek.com/chat/completions';
const publicDir = __dirname;
const mimeTypes = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };

const server = http.createServer(async (request, response) => {
  if (request.method === 'OPTIONS') {
    response.writeHead(204, corsHeaders());
    response.end();
    return;
  }
  if (request.method === 'GET' && request.url === '/api/health') {
    sendJson(response, 200, { ok: true, deepseekConfigured: Boolean(process.env.DEEPSEEK_API_KEY) });
    return;
  }
  if (request.method === 'POST' && request.url === '/api/coach') {
    await handleCoachRequest(request, response);
    return;
  }
  serveStaticFile(request, response);
});

server.listen(port, () => {
  console.log(`AI Interview Coach running at http://localhost:${port}`);
});

async function handleCoachRequest(request, response) {
  try {
    const body = await readJson(request);
    if (!body.question || !body.answer) {
      sendJson(response, 400, { error: 'question and answer are required' });
      return;
    }
    if (String(body.question).length > 4000 || String(body.answer).length > 12000) {
      sendJson(response, 413, { error: '问题或回答内容过长，请适当精简后重试' });
      return;
    }
    if (!process.env.DEEPSEEK_API_KEY || process.env.DEEPSEEK_API_KEY.includes('your-key-here')) {
      sendJson(response, 503, { error: '请在项目根目录的 .env 文件中配置 DEEPSEEK_API_KEY' });
      return;
    }
    const deepseekResponse = await fetch(deepseekUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(30000),
      body: JSON.stringify({
        model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
        temperature: 0.4,
        max_tokens: 180,
        messages: [
          { role: 'system', content: '你是一名严格但友善的 AI 应用岗位面试教练。请用简洁自然的中文点评候选人的回答，只输出 2-3 句反馈：先指出一个优点，再指出一个最值得改进的地方，并给出可执行建议。不要打分，不要使用 Markdown。' },
          { role: 'user', content: `面试问题：${body.question}\n\n候选人回答：${body.answer}` }
        ]
      })
    });
    const result = await deepseekResponse.json();
    if (!deepseekResponse.ok) {
      sendJson(response, deepseekResponse.status, { error: result.error?.message || `DeepSeek API error (${deepseekResponse.status})` });
      return;
    }
    sendJson(response, 200, { feedback: result.choices?.[0]?.message?.content?.trim() || '' });
  } catch (error) {
    sendJson(response, 500, { error: error.message });
  }
}

function serveStaticFile(request, response) {
  const cleanPath = request.url.split('?')[0];
  const requestedPath = cleanPath === '/' ? '/index.html' : cleanPath;
  const filePath = path.resolve(publicDir, `.${requestedPath}`);
  if (!filePath.startsWith(publicDir) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    response.writeHead(404); response.end('Not found'); return;
  }
  response.writeHead(200, { 'Content-Type': mimeTypes[path.extname(filePath)] || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(response);
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let data = '';
    request.on('data', (chunk) => { data += chunk; if (data.length > 100000) reject(new Error('Request body too large')); });
    request.on('end', () => { try { resolve(JSON.parse(data)); } catch { reject(new Error('Invalid JSON')); } });
    request.on('error', reject);
  });
}

function sendJson(response, status, body) {
  response.writeHead(status, { ...corsHeaders(), 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

function corsHeaders() {
  return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };
}

function loadEnvFile() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;
  fs.readFileSync(envPath, 'utf8').split(/\r?\n/).forEach((line) => {
    const match = line.match(/^\s*([^#=]+)=(.*)\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  });
}