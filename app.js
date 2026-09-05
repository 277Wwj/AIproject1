const viewNames = { dashboard: '今日总览', practice: '开始练习', history: '练习记录', growth: '能力成长' };
const questions = [
  { title: '我们开始吧。', text: '请用 2 分钟，向面试官介绍一个你最近参与的、最有挑战的 AI 项目。重点说说你的具体贡献。' },
  { title: '继续深入一点。', text: '如果这个 AI Agent 上线后经常给出不可靠的结果，你会如何定位问题并设计改进方案？' },
  { title: '最后一个问题。', text: '假设资源有限，你会优先优化 Agent 的哪个环节？请说说你的判断依据。' }
];
const scenarioQuestions = {
  system: questions,
  behavior: [
    { title: '从一段经历开始。', text: '请讲一个你推动团队解决困难问题的经历。重点说明当时的背景、你的行动和最终结果。' },
    { title: '把冲突讲清楚。', text: '遇到意见不一致时，你如何让团队达成共识？请结合一个具体例子。' },
    { title: '复盘这次选择。', text: '回看这段经历，你现在会做出什么不同的选择？为什么？' }
  ],
  product: [
    { title: '先理解用户。', text: '如果要为求职者设计一个 AI 面试产品，你会优先服务哪类用户？为什么？' },
    { title: '做一个取舍。', text: '用户同时想要实时语音陪练和深度答案分析，但资源只能做一个，你会怎么选？' },
    { title: '定义成功。', text: '你会用哪些指标判断这个 AI 面试产品真的帮助用户拿到了更好的结果？' }
  ]
};
let currentQuestion = 0;
let currentScenario = 'system';
let sessionAnswers = [];
let submitMode = 'submit';
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

function showView(view) {
  $$('.view').forEach((item) => item.classList.toggle('active', item.id === `${view}-view`));
  $$('.nav-item').forEach((item) => item.classList.toggle('active', item.dataset.view === view));
  $('#page-title').textContent = viewNames[view];
}

function openPractice(scenario = 'system') {
  currentScenario = scenario;
  currentQuestion = 0;
  sessionAnswers = [];
  submitMode = 'submit';
  $('#submit-answer').innerHTML = '提交回答 <span>→</span>';
  updateQuestion();
  $('#answer-input').value = '';
  $('#ai-feedback').classList.remove('show');
  $('#practice-modal').classList.add('open');
  setTimeout(() => $('#answer-input').focus(), 100);
}

function updateQuestion() {
  const activeQuestions = scenarioQuestions[currentScenario];
  if (!activeQuestions[currentQuestion]) return;
  const question = activeQuestions[currentQuestion];
  $('#question-count').textContent = `QUESTION 0${currentQuestion + 1} / 03`;
  $('#modal-progress-bar').style.width = `${((currentQuestion + 1) / activeQuestions.length) * 100}%`;
  $('#question-title').textContent = question.title;
  $('#question-text').textContent = question.text;
}

async function submitAnswer() {
  const answer = $('#answer-input').value.trim();
  if (answer.length < 8) {
    showToast('先多写两句具体内容，教练才能给出有效反馈');
    $('#answer-input').focus();
    return;
  }
  const submitButton = $('#submit-answer');
  submitButton.disabled = true;
  submitButton.textContent = 'DeepSeek 正在分析…';
  sessionAnswers[currentQuestion] = answer;
  const activeQuestions = scenarioQuestions[currentScenario];
  const localFeedback = ['结构很清晰。可以再补充一个具体的业务指标，让成果更有说服力。', '这个判断很专业。建议继续说明你会如何验证改动确实带来了改善。', '优先级判断合理，记得把用户价值和实现成本放在同一张权衡表里。'];
  let feedback = localFeedback[currentQuestion];
  try {
    const apiUrl = window.location.protocol === 'file:' ? 'http://localhost:3000/api/coach' : '/api/coach';
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: activeQuestions[currentQuestion].text, answer })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `DeepSeek 请求失败（${response.status}）`);
    if (data.feedback) feedback = data.feedback;
  } catch (error) {
    showToast(`${error.message}，已切换为本地教练反馈`);
  }
  submitButton.disabled = false;
  $('#feedback-text').textContent = feedback;
  $('#ai-feedback').classList.add('show');
  if (currentQuestion < activeQuestions.length - 1) {
    $('#submit-answer').innerHTML = '下一题 <span>→</span>';
    submitMode = 'next';
  } else {
    $('#submit-answer').innerHTML = '完成练习 <span>✓</span>';
    submitMode = 'finish';
  }
}

function handleSubmitButton() {
  if (submitMode === 'next') {
    currentQuestion = Math.min(currentQuestion + 1, scenarioQuestions[currentScenario].length - 1);
    updateQuestion();
    $('#answer-input').value = '';
    $('#ai-feedback').classList.remove('show');
    submitMode = 'submit';
    $('#submit-answer').innerHTML = '提交回答 <span>→</span>';
    return;
  }
  if (submitMode === 'finish') {
    finishPractice();
    return;
  }
  submitAnswer();
}

function finishPractice() {
  const result = buildResult();
  saveSession(result);
  renderDashboard();
  renderHistory();
  $('#practice-modal').classList.remove('open');
  showReport(result);
  showView('history');
}

function buildResult() {
  const answers = sessionAnswers.filter(Boolean);
  const answerText = answers.join(' ');
  const detail = {
    clarity: Math.min(96, 58 + answers.length * 7 + (answerText.length > 100 ? 12 : 0)),
    depth: Math.min(94, 52 + (answerText.includes('因为') || answerText.includes('通过') ? 18 : 4) + answers.length * 5),
    impact: Math.min(92, 45 + (/%|提升|增长|降低|指标|结果/.test(answerText) ? 28 : 4)),
    structure: Math.min(95, 60 + answers.length * 8)
  };
  const score = Math.round(Object.values(detail).reduce((sum, value) => sum + value, 0) / 4);
  return { id: Date.now(), scenario: currentScenario, title: scenarioTitle(currentScenario), score, detail, answers, createdAt: new Date().toISOString() };
}

function scenarioTitle(scenario) {
  return { system: '系统设计 · AI Agent', behavior: '行为面试 · 项目复盘', product: '产品思维 · 用户洞察' }[scenario];
}

function getSessions() {
  try { return JSON.parse(localStorage.getItem('interview-sessions') || '[]'); } catch { return []; }
}

function saveSession(result) {
  localStorage.setItem('interview-sessions', JSON.stringify([result, ...getSessions()].slice(0, 20)));
}

function renderDashboard() {
  const sessions = getSessions();
  const scores = sessions.map((item) => item.score);
  const average = scores.length ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : 78;
  const total = document.querySelector('.stat-card:nth-child(1)>strong');
  const averageScore = document.querySelector('.stat-card:nth-child(2)>strong');
  if (total) total.textContent = 24 + sessions.length;
  if (averageScore) averageScore.innerHTML = `${average}<span class="unit">/100</span>`;
}

function renderHistory() {
  let container = $('#history-list');
  if (!container) {
    container = document.createElement('div');
    container.id = 'history-list';
    $('.table-panel').appendChild(container);
  }
  const sessions = getSessions();
  container.innerHTML = sessions.length ? sessions.map((item) => `<div class="history-row"><strong>${item.title}</strong><span>${formatDate(item.createdAt)}</span><b class="score ${item.score >= 80 ? 'good' : ''}">${item.score}</b><span class="status">已完成</span></div>`).join('') : '';
}

function formatDate(date) {
  return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(date));
}

function showReport(result) {
  ensureReportModal();
  $('#report-score').textContent = result.score;
  $('#report-title').textContent = result.title;
  $('#report-summary').textContent = result.score >= 80 ? '表现稳定，已经具备很好的面试表达基础。继续增加具体指标和决策依据，答案会更有竞争力。' : '回答方向正确，建议继续补充具体行动、数据结果和复盘，让面试官更容易看见你的真实能力。';
  $('#report-modal').classList.add('open');
}

function ensureReportModal() {
  if ($('#report-modal')) return;
  document.body.insertAdjacentHTML('beforeend', `<div class="modal-backdrop" id="report-modal"><div class="report-modal"><button class="close-modal" id="close-report">×</button><span class="eyebrow accent">SESSION REPORT</span><h2 id="report-title">练习报告</h2><div class="report-score"><strong id="report-score">0</strong><span>/100</span></div><p id="report-summary"></p><div class="report-actions"><button class="outline-button" id="close-report-action">稍后查看</button><button class="dark-button" id="report-history-action">查看完整记录 <span>→</span></button></div></div></div>`);
  $('#close-report-action').addEventListener('click', () => $('#report-modal').classList.remove('open'));
  $('#report-history-action').addEventListener('click', () => { $('#report-modal').classList.remove('open'); showView('history'); });
}

function exportReport() {
  const sessions = getSessions();
  const blob = new Blob([JSON.stringify(sessions, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'interview-coach-report.json';
  link.click();
  URL.revokeObjectURL(link.href);
}

function showToast(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(window.toastTimer);
  window.toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
}

$$('.nav-item').forEach((item) => item.addEventListener('click', () => showView(item.dataset.view)));
$$('[data-view-target]').forEach((item) => item.addEventListener('click', () => showView(item.dataset.viewTarget)));
$('#start-hero').addEventListener('click', openPractice);
$('#start-recommended').addEventListener('click', openPractice);
$$('.practice-card').forEach((item) => item.addEventListener('click', () => openPractice(item.dataset.practice)));
$('#close-modal').addEventListener('click', () => $('#practice-modal').classList.remove('open'));
$('#practice-modal').addEventListener('click', (event) => { if (event.target.id === 'practice-modal') event.currentTarget.classList.remove('open'); });
$('#submit-answer').onclick = handleSubmitButton;
$('#answer-input').addEventListener('keydown', (event) => { if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') submitAnswer(); });
$('#help-btn').addEventListener('click', () => showToast('回答越具体，AI 教练的反馈越有价值'));
$('#export-btn').addEventListener('click', exportReport);
document.addEventListener('click', (event) => { if (event.target.id === 'close-report') $('#report-modal').classList.remove('open'); if (event.target.id === 'report-modal') event.target.classList.remove('open'); });
ensureReportModal();
renderDashboard();
renderHistory();
