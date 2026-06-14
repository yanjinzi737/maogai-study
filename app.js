import * as pdfjsLib from "./vendor/pdf.min.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc = "./vendor/pdf.worker.min.mjs";

const STORAGE_KEY = "qingmiao-maogai-v1";
const todayKey = () => new Date().toISOString().slice(0, 10);
const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;

const demoQuestions = [
  {
    id: "demo-1", source: "演示题库", type: "multiple",
    stem: "毛泽东思想活的灵魂包括哪些基本方面？",
    options: [{key:"A",text:"实事求是"},{key:"B",text:"群众路线"},{key:"C",text:"独立自主"},{key:"D",text:"改革开放"}],
    answer: ["A","B","C"], explanation: "实事求是、群众路线、独立自主是毛泽东思想活的灵魂。", point: "毛泽东思想活的灵魂", demo: true
  },
  {
    id: "demo-2", source: "演示题库", type: "single",
    stem: "认清中国国情，是解决中国革命问题的基本前提。近代中国最基本的国情是？",
    options: [{key:"A",text:"封建社会"},{key:"B",text:"半殖民地半封建社会"},{key:"C",text:"资本主义社会"},{key:"D",text:"新民主主义社会"}],
    answer: ["B"], explanation: "近代中国逐步沦为半殖民地半封建社会，这是分析近代中国一切社会问题的基本依据。", point: "新民主主义革命理论", demo: true
  },
  {
    id: "demo-3", source: "演示题库", type: "single",
    stem: "新民主主义革命的首要对象是？",
    options: [{key:"A",text:"封建主义"},{key:"B",text:"官僚资本主义"},{key:"C",text:"帝国主义"},{key:"D",text:"民族资本主义"}],
    answer: ["C"], explanation: "帝国主义是中国人民第一个和最凶恶的敌人，是新民主主义革命的首要对象。", point: "新民主主义革命理论", demo: true
  },
  {
    id: "demo-4", source: "演示题库", type: "multiple",
    stem: "中国共产党在中国革命中战胜敌人的三个主要法宝是？",
    options: [{key:"A",text:"统一战线"},{key:"B",text:"武装斗争"},{key:"C",text:"党的建设"},{key:"D",text:"土地革命"}],
    answer: ["A","B","C"], explanation: "统一战线、武装斗争、党的建设，是中国共产党在中国革命中战胜敌人的三个主要法宝。", point: "新民主主义革命理论", demo: true
  },
  {
    id: "demo-5", source: "演示题库", type: "single",
    stem: "社会主义初级阶段基本路线的简明概括是？",
    options: [{key:"A",text:"一个中心、两个基本点"},{key:"B",text:"四项基本原则"},{key:"C",text:"改革开放"},{key:"D",text:"共同富裕"}],
    answer: ["A"], explanation: "党的基本路线可简明概括为“一个中心、两个基本点”。", point: "社会主义初级阶段理论", demo: true
  },
  {
    id: "demo-6", source: "演示题库", type: "single",
    stem: "邓小平理论首要的基本理论问题是？",
    options: [{key:"A",text:"实现什么样的发展、怎样发展"},{key:"B",text:"什么是社会主义、怎样建设社会主义"},{key:"C",text:"建设什么样的党、怎样建设党"},{key:"D",text:"坚持和发展什么样的中国特色社会主义"}],
    answer: ["B"], explanation: "“什么是社会主义、怎样建设社会主义”是邓小平理论首要的基本理论问题。", point: "邓小平理论", demo: true
  }
];

const defaultState = {
  questions: [],
  materials: [],
  progress: {},
  dailyGoal: 20,
  daily: {},
  importedRealBank: false
};

let state = loadState();
let sharedQuestions = [];
let sharedMaterials = [];
let siteConfig = {};
let currentView = "home";
let reviewFilter = "wrong";
let session = null;
let selectedAnswers = new Set();
let pendingNoteTimer = null;

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return saved
      ? {...defaultState, ...saved, questions: Array.isArray(saved.questions) ? saved.questions : []}
      : structuredClone(defaultState);
  } catch {
    return structuredClone(defaultState);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>'"]/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"})[char]);
}

function showToast(message) {
  const toast = document.querySelector("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 2600);
}

function getProgress(id) {
  return state.progress[id] || {attempts: 0, correct: 0, wrong: 0, starred: false, note: "", lastCorrect: null};
}

function setProgress(id, update) {
  state.progress[id] = {...getProgress(id), ...update};
  saveState();
}

function realQuestions() {
  const combined = [...sharedQuestions, ...state.questions];
  const unique = new Map();
  for (const question of combined) {
    const signature = question.stem.replace(/\s+/g, "").toLowerCase();
    if (!unique.has(signature)) unique.set(signature, question);
  }
  return [...unique.values()];
}

function wrongQuestions() {
  return realQuestions().filter(q => {
    const p = getProgress(q.id);
    return p.wrong > 0 && p.lastCorrect !== true;
  });
}

function starredQuestions() { return realQuestions().filter(q => getProgress(q.id).starred); }
function notedQuestions() { return realQuestions().filter(q => getProgress(q.id).note?.trim()); }

function navigate(view) {
  currentView = view;
  document.querySelectorAll(".view").forEach(el => el.classList.toggle("active", el.dataset.viewPanel === view));
  document.querySelectorAll(".nav-item").forEach(el => el.classList.toggle("active", el.dataset.view === view));
  const copy = {
    home: ["复习总览", "今天也稳稳拿下一组题"],
    bank: ["题库管理", "你的必考题，都收在这里"],
    review: ["针对性复习", "错过的题，要真正弄明白"],
    knowledge: ["知识点地图", "从题目回到概念本身"]
  }[view];
  document.querySelector("#viewEyebrow").textContent = copy[0];
  document.querySelector("#viewTitle").textContent = copy[1];
  if (view === "bank") renderBank();
  if (view === "review") renderReview();
  if (view === "knowledge") renderKnowledge();
  window.scrollTo({top: 0, behavior: "smooth"});
}

function renderAll() {
  const questions = realQuestions();
  const progress = Object.values(state.progress);
  const attempts = progress.reduce((sum, p) => sum + (p.attempts || 0), 0);
  const correct = progress.reduce((sum, p) => sum + (p.correct || 0), 0);
  const wrong = wrongQuestions().length;
  const points = new Set(questions.map(q => q.point).filter(Boolean));
  const done = state.daily[todayKey()] || 0;
  const goal = state.dailyGoal || 20;
  const percent = Math.min(100, Math.round(done / goal * 100));

  text("#totalStat", questions.length);
  text("#attemptStat", attempts);
  text("#accuracyStat", attempts ? `${Math.round(correct / attempts * 100)}%` : "0%");
  text("#wrongStat", wrong);
  text("#navQuestionCount", questions.length);
  text("#navWrongCount", wrong);
  text("#navPointCount", points.size);
  text("#todayDone", done);
  text("#dailyRemaining", Math.max(0, goal - done));
  document.querySelector(".goal-ring span").textContent = `/ ${goal}`;
  document.querySelector("#goalRing").style.strokeDashoffset = String(301.6 * (1 - percent / 100));
  document.querySelector("#homeHint").textContent = sharedQuestions.length
    ? `公共题库已加载，共 ${sharedQuestions.length} 道题。你的学习记录只保存在当前设备。`
    : state.questions.length
      ? `当前使用个人题库，共 ${questions.length} 道题。学习记录只保存在当前设备。`
      : "公共题库正在准备中，你也可以先导入自己的题库。";
  text("#wrongTabCount", wrong);
  text("#starTabCount", starredQuestions().length);
  text("#noteTabCount", notedQuestions().length);
  renderBank();
  renderReview();
  renderKnowledge();
}

function text(selector, value) { const el = document.querySelector(selector); if (el) el.textContent = value; }

function renderBank() {
  const search = (document.querySelector("#bankSearch")?.value || "").trim().toLowerCase();
  const source = document.querySelector("#sourceFilter")?.value || "all";
  const sources = [...new Set(realQuestions().map(q => q.source))];
  const select = document.querySelector("#sourceFilter");
  if (select) {
    const previous = select.value;
    select.innerHTML = `<option value="all">全部来源</option>${sources.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join("")}`;
    if (["all", ...sources].includes(previous)) select.value = previous;
  }
  const filtered = realQuestions().filter(q => {
    const haystack = [q.stem, q.point, q.source, q.explanation, ...q.options.map(o => o.text)].join(" ").toLowerCase();
    return (!search || haystack.includes(search)) && (source === "all" || q.source === source);
  });
  text("#bankSummary", `显示 ${filtered.length} / ${realQuestions().length} 道题，来自 ${sources.length} 个来源`);
  const list = document.querySelector("#questionList");
  if (!list) return;
  if (!filtered.length) {
    list.innerHTML = `<div class="empty-state"><strong>没有匹配的题目</strong><span>换一个关键词，或导入新的题库文件。</span></div>`;
    return;
  }
  list.innerHTML = filtered.map((q, index) => {
    const p = getProgress(q.id);
    return `<article class="question-row">
      <span class="q-number">${String(index + 1).padStart(2, "0")}</span>
      <div><h3>${escapeHtml(q.stem)}</h3><p>${escapeHtml(q.source)} · 答案 ${escapeHtml(q.answer.join(""))}</p>
      <div class="tag-line">${q.point ? `<span class="tag">${escapeHtml(q.point)}</span>` : ""}${p.lastCorrect === false ? `<span class="tag danger">待重练</span>` : ""}${p.starred ? `<span class="tag">已收藏</span>` : ""}</div></div>
      <div class="row-actions"><button class="mini-button" data-practice-one="${q.id}">练这题</button>${state.questions.some(item => item.id === q.id) ? `<button class="mini-button" data-delete-question="${q.id}">删除</button>` : ""}</div>
    </article>`;
  }).join("");
}

function renderReview() {
  const pool = reviewFilter === "wrong" ? wrongQuestions() : reviewFilter === "starred" ? starredQuestions() : notedQuestions();
  document.querySelectorAll(".tab").forEach(tab => tab.classList.toggle("active", tab.dataset.reviewFilter === reviewFilter));
  const list = document.querySelector("#reviewList");
  if (!list) return;
  if (!pool.length) {
    const messages = {
      wrong: ["目前没有待攻克错题", "答错后题目会自动来到这里；答对一次后会移出当前错题。"],
      starred: ["还没有收藏题目", "刷题时点“收藏”，把高频题和易混题集中起来。"],
      notes: ["还没有学习笔记", "提交答案后可以记录错误原因和记忆提示。"]
    }[reviewFilter];
    list.innerHTML = `<div class="empty-state"><strong>${messages[0]}</strong><span>${messages[1]}</span></div>`;
    return;
  }
  list.innerHTML = pool.map(q => {
    const p = getProgress(q.id);
    const detail = reviewFilter === "notes" ? p.note : (q.explanation || "这道题暂无解析，可以在答题后补充个人笔记。 ");
    return `<article class="review-card"><header><h3>${escapeHtml(q.stem)}</h3><button class="mini-button" data-practice-one="${q.id}">立即重练</button></header>
      <div class="tag-line"><span class="tag">${escapeHtml(q.point || "未标注知识点")}</span><span class="tag">答案 ${escapeHtml(q.answer.join(""))}</span></div>
      <p class="answer-mini">${escapeHtml(detail)}</p></article>`;
  }).join("");
}

function getPointStats() {
  const map = new Map();
  for (const q of realQuestions()) {
    const name = q.point || "未分类知识点";
    if (!map.has(name)) map.set(name, {name, questions: [], attempts: 0, correct: 0, explanations: []});
    const item = map.get(name);
    const p = getProgress(q.id);
    item.questions.push(q);
    item.attempts += p.attempts || 0;
    item.correct += p.correct || 0;
    if (q.explanation) item.explanations.push(q.explanation);
  }
  return [...map.values()].map(item => ({...item, accuracy: item.attempts ? Math.round(item.correct / item.attempts * 100) : null}))
    .sort((a, b) => (a.accuracy ?? -1) - (b.accuracy ?? -1) || b.questions.length - a.questions.length);
}

function renderKnowledge() {
  const points = getPointStats();
  const grid = document.querySelector("#pointGrid");
  if (!grid) return;
  grid.innerHTML = points.length ? points.map(point => `<button class="point-card" data-practice-point="${escapeHtml(point.name)}">
    <header><h3>${escapeHtml(point.name)}</h3><span>${point.questions.length} 题</span></header>
    <p>${escapeHtml(point.explanations[0] || "题库中暂时没有解析。可以在答题笔记中补充这个知识点的判断依据。")}</p>
    <div class="mastery-line"><span>当前正确率</span><strong>${point.accuracy === null ? "尚未练习" : `${point.accuracy}%`}</strong></div>
  </button>`).join("") : `<div class="empty-state"><strong>还没有知识点数据</strong><span>导入带“知识点”字段的题库后，这里会自动生成复习卡片。</span></div>`;
  renderMaterialResults();
}

function renderMaterialResults() {
  const query = (document.querySelector("#materialSearch")?.value || "").trim();
  const container = document.querySelector("#materialResults");
  if (!container) return;
  const materials = [...sharedMaterials, ...state.materials];
  if (!materials.length) {
    container.innerHTML = `<div class="empty-state"><strong>还没有上传复习资料</strong><span>上传不含选择题的 Word、PDF 或文本文件后，会作为全文资料保存。</span></div>`;
    return;
  }
  const lower = query.toLowerCase();
  const hits = materials.filter(m => !lower || m.text.toLowerCase().includes(lower) || m.name.toLowerCase().includes(lower));
  if (!hits.length) {
    container.innerHTML = `<div class="empty-state"><strong>资料中没有找到这个词</strong><span>尝试缩短关键词，或检查资料是否已成功导入。</span></div>`;
    return;
  }
  container.innerHTML = hits.map(m => {
    let snippet = m.text.replace(/\s+/g, " ").trim();
    if (query) {
      const index = snippet.toLowerCase().indexOf(lower);
      snippet = snippet.slice(Math.max(0, index - 75), index + query.length + 150);
    } else snippet = snippet.slice(0, 220);
    const safe = escapeHtml(snippet);
    const highlighted = query ? safe.replace(new RegExp(escapeRegExp(escapeHtml(query)), "gi"), match => `<mark>${match}</mark>`) : safe;
    return `<article class="material-card"><header><strong>${escapeHtml(m.name)}</strong><small>${Math.round(m.text.length / 1000)}k 字符</small></header><p>${highlighted}${snippet.length >= 220 ? "…" : ""}</p></article>`;
  }).join("");
}

function escapeRegExp(value) { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

function startPractice(mode, customPool = null) {
  let pool = customPool ? [...customPool] : mode === "wrong" ? wrongQuestions() : mode === "starred" ? starredQuestions() : [...realQuestions()];
  if (mode === "random") pool.sort(() => Math.random() - .5);
  if (!pool.length) {
    showToast(mode === "wrong" ? "目前没有待重练错题" : "这个练习列表还是空的");
    return;
  }
  session = {mode, questions: pool, index: 0, locked: false};
  selectedAnswers = new Set();
  document.querySelector("#practiceScreen").classList.add("open");
  document.querySelector("#practiceScreen").setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
  renderPracticeQuestion();
}

function renderPracticeQuestion() {
  const q = session.questions[session.index];
  session.locked = false;
  selectedAnswers = new Set();
  const p = getProgress(q.id);
  text("#practiceModeLabel", {all:"顺序刷题",random:"随机练习",wrong:"错题重练",starred:"收藏练习",point:"知识点专项",single:"单题练习"}[session.mode] || "练习");
  text("#practiceCounter", `${session.index + 1} / ${session.questions.length}`);
  document.querySelector("#practiceProgressBar").style.width = `${(session.index + 1) / session.questions.length * 100}%`;
  text("#questionType", q.type === "multiple" || q.answer.length > 1 ? "多选题" : "单选题");
  text("#questionPoint", q.point || "未标注知识点");
  text("#practiceStem", q.stem);
  const star = document.querySelector("#starQuestionButton");
  star.classList.toggle("active", Boolean(p.starred));
  star.textContent = p.starred ? "已收藏" : "收藏";
  document.querySelector("#practiceOptions").innerHTML = q.options.map(o => `<button class="option-button" data-option="${escapeHtml(o.key)}"><span class="option-key">${escapeHtml(o.key)}</span><span>${escapeHtml(o.text)}</span></button>`).join("");
  document.querySelector("#answerPanel").hidden = true;
  document.querySelector("#submitAnswerButton").hidden = false;
  document.querySelector("#submitAnswerButton").disabled = true;
  document.querySelector("#nextQuestionButton").hidden = true;
  document.querySelector("#skipButton").hidden = false;
}

function selectOption(key) {
  if (!session || session.locked) return;
  const q = session.questions[session.index];
  if (q.type === "multiple" || q.answer.length > 1) {
    selectedAnswers.has(key) ? selectedAnswers.delete(key) : selectedAnswers.add(key);
  } else {
    selectedAnswers = new Set([key]);
  }
  document.querySelectorAll(".option-button").forEach(btn => btn.classList.toggle("selected", selectedAnswers.has(btn.dataset.option)));
  document.querySelector("#submitAnswerButton").disabled = selectedAnswers.size === 0;
}

function submitAnswer() {
  if (!session || session.locked || !selectedAnswers.size) return;
  const q = session.questions[session.index];
  const chosen = [...selectedAnswers].sort().join("");
  const answer = [...q.answer].sort().join("");
  const correct = chosen === answer;
  session.locked = true;
  document.querySelectorAll(".option-button").forEach(btn => {
    const key = btn.dataset.option;
    btn.classList.remove("selected");
    if (q.answer.includes(key)) btn.classList.add("correct");
    else if (selectedAnswers.has(key)) btn.classList.add("wrong");
  });
  const p = getProgress(q.id);
  setProgress(q.id, {attempts: p.attempts + 1, correct: p.correct + (correct ? 1 : 0), wrong: p.wrong + (correct ? 0 : 1), lastCorrect: correct, lastAt: Date.now()});
  state.daily[todayKey()] = (state.daily[todayKey()] || 0) + 1;
  saveState();
  const status = document.querySelector("#answerStatus");
  status.textContent = correct ? "回答正确" : "这题需要再看一次";
  status.className = correct ? "correct-text" : "wrong-text";
  text("#correctAnswer", `正确答案：${answer}`);
  text("#answerExplanation", q.explanation || "题库没有提供解析。建议在下方写出判断依据，后续可集中复习。 ");
  document.querySelector("#questionNote").value = getProgress(q.id).note || "";
  document.querySelector("#answerPanel").hidden = false;
  document.querySelector("#submitAnswerButton").hidden = true;
  document.querySelector("#nextQuestionButton").hidden = false;
  document.querySelector("#nextQuestionButton").textContent = session.index === session.questions.length - 1 ? "完成练习" : "下一题";
  document.querySelector("#skipButton").hidden = true;
  renderAll();
}

function nextQuestion() {
  if (!session) return;
  saveCurrentNote();
  if (session.index >= session.questions.length - 1) {
    closePractice();
    showToast("本组练习完成，进度已经保存");
    return;
  }
  session.index += 1;
  renderPracticeQuestion();
  document.querySelector(".practice-screen").scrollTo({top: 0, behavior: "smooth"});
}

function skipQuestion() {
  if (!session) return;
  if (session.questions.length === 1 || session.index === session.questions.length - 1) closePractice();
  else { session.index += 1; renderPracticeQuestion(); }
}

function saveCurrentNote() {
  if (!session || !session.locked) return;
  const q = session.questions[session.index];
  setProgress(q.id, {note: document.querySelector("#questionNote").value.trim()});
}

function closePractice() {
  saveCurrentNote();
  session = null;
  document.querySelector("#practiceScreen").classList.remove("open");
  document.querySelector("#practiceScreen").setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
  renderAll();
}

function normalizeAnswer(raw) {
  const normalized = String(raw || "")
    .toUpperCase()
    .replace(/[Ａ-Ｈ]/g, letter => String.fromCharCode(letter.charCodeAt(0) - 65248))
    .replace(/^(?:【?(?:参考)?答案】?|正确答案|正确选项|答案)s*(?:是|为)?s*[:：]?\s*/i, "")
    .trim();
  const cluster = normalized.match(/^[（(\[【]?\s*([A-H](?:\s*[,，、/和及或]?\s*[A-H])*)/);
  return [...new Set((cluster?.[1] || "").match(/[A-H]/g) || [])].sort();
}

function optionKey(raw) {
  const letter = String(raw || "").toUpperCase();
  return letter >= "Ａ" && letter <= "Ｈ" ? String.fromCharCode(letter.charCodeAt(0) - 65248) : letter;
}

function expandInlineMarkers(raw) {
  const widthNormalized = raw.replace(/[０-９]/g, digit => String.fromCharCode(digit.charCodeAt(0) - 65248));
  const parenthesizedOptionsExpanded = widthNormalized.replace(/[^\n]+/g, line => {
    const markers = line.match(/[（(]\s*[A-HＡ-Ｈ]\s*[）)]/g) || [];
    if (markers.length < 2) return line;
    return line.replace(/\s*[（(]\s*([A-HＡ-Ｈ])\s*[）)]\s*/g, (match, key) => `\n${optionKey(key)}. `);
  });
  return parenthesizedOptionsExpanded
    .replace(/\u00a0/g, " ")
    .replace(/\r/g, "")
    .replace(/([^\n])\s+(?=(?:【?(?:参考)?答案】?|正确答案|正确选项|答案)\s*(?:是|为)?\s*[:：]?\s*[（(\[【]?\s*[A-HＡ-Ｈ])/gi, "$1\n")
    .replace(/([^\n])\s+(?=(?:【?解析】?|答案解析|知识点|考点)\s*[:：])/gi, "$1\n")
    .replace(/(^|[\s\t])([A-HＡ-Ｈ])\s*[.、．:：)）]\s*/g, (match, before, key) => `${before === "\n" || before === "" ? before : "\n"}${optionKey(key)}. `)
    .replace(/((?:【?(?:参考)?答案】?|正确答案|正确选项|答案)\s*(?:是|为)?\s*[:：]?\s*[（(\[【]?\s*[A-HＡ-Ｈ](?:\s*[,，、/和及或]?\s*[A-HＡ-Ｈ])*)\s+(?=(?:第\s*)?\d{1,4}(?:\s*题)?[.、．:：)）])/gi, "$1\n");
}

function parseTableQuestions(raw, source) {
  const rows = raw.split("\n").map(line => line.split("\t").map(cell => cell.trim()).filter(Boolean)).filter(cells => cells.length >= 4);
  if (!rows.length) return [];
  const questions = [];
  let columns = null;
  for (const cells of rows) {
    const headerText = cells.join("|");
    if (/题目|题干/.test(headerText) && /答案/.test(headerText)) {
      columns = {
        stem: cells.findIndex(cell => /题目|题干/.test(cell)),
        answer: cells.findIndex(cell => /答案/.test(cell)),
        explanation: cells.findIndex(cell => /解析/.test(cell)),
        point: cells.findIndex(cell => /知识点|考点/.test(cell)),
        options: {}
      };
      cells.forEach((cell, index) => {
        const match = cell.match(/(?:选项)?\s*([A-HＡ-Ｈ])/i);
        if (match) columns.options[optionKey(match[1])] = index;
      });
      continue;
    }
    if (!columns || columns.stem < 0 || columns.answer < 0) continue;
    const options = Object.entries(columns.options).map(([key, index]) => ({key, text: cells[index] || ""})).filter(option => option.text);
    const answer = normalizeAnswer(cells[columns.answer]);
    const stem = cells[columns.stem] || "";
    if (stem && options.length >= 2 && answer.length) {
      questions.push({
        id: uid(), source, stem, options, answer,
        type: answer.length > 1 ? "multiple" : "single",
        explanation: columns.explanation >= 0 ? (cells[columns.explanation] || "") : "",
        point: columns.point >= 0 ? (cells[columns.point] || "") : ""
      });
    }
  }
  return questions;
}

function extractAnswerKey(raw) {
  const answers = new Map();
  const sectionMatch = raw.match(/(?:参考答案|答案汇总|选择题答案)\s*[:：]?\s*([\s\S]{1,12000})/i);
  if (!sectionMatch) return answers;
  const pairPattern = /(\d{1,4})\s*[.、．:：)）\-]?\s*(?:答案\s*[:：]?)?\s*[（(\[【]?\s*([A-HＡ-Ｈ](?:\s*[,，、/和及或]?\s*[A-HＡ-Ｈ])*)/gi;
  for (const match of sectionMatch[1].matchAll(pairPattern)) {
    const answer = normalizeAnswer(match[2]);
    if (answer.length) answers.set(match[1], answer.join(""));
  }
  return answers;
}

function parseQuestionText(raw, source = "粘贴导入") {
  const tableQuestions = parseTableQuestions(raw, source);
  const answerKey = extractAnswerKey(raw);
  const lines = expandInlineMarkers(raw).split("\n").map(line => line.trim()).filter(Boolean);
  const questions = [...tableQuestions];
  const diagnostics = {candidates: 0, withOptions: 0, missingAnswers: 0, textLength: raw.trim().length};
  let current = null;
  const flush = () => {
    if (!current || !current.stem) return;
    diagnostics.candidates += 1;
    if (current.options.length < 2) return;
    diagnostics.withOptions += 1;
    current.answer = normalizeAnswer(current.answerRaw);
    if (!current.answer.length) current.answer = normalizeAnswer(answerKey.get(current.number));
    if (!current.answer.length) {
      const embedded = current.stem.match(/[（(\[【]\s*([A-HＡ-Ｈ](?:\s*[,，、/和及或]?\s*[A-HＡ-Ｈ])*)\s*[）)\]】]/);
      current.answer = normalizeAnswer(embedded?.[1]);
    }
    if (!current.answer.length) { diagnostics.missingAnswers += 1; return; }
    current.type = current.answer.length > 1 ? "multiple" : "single";
    delete current.answerRaw;
    delete current.number;
    current.id = uid();
    current.source = source;
    questions.push(current);
  };
  for (const line of lines) {
    const qMatch = line.match(/^(?:(?:单选题|多选题|选择题)\s*)?(?:第\s*)?(\d{1,4})(?:\s*题)?[.、．:：)）]\s*(.+)$/);
    const optionMatch = line.match(/^([A-HＡ-Ｈ])[.、．:：)）]\s*(.+)$/i);
    const answerMatch = line.match(/^(?:【?(?:参考)?答案】?|正确答案|正确选项)\s*(?:是|为)?\s*[:：]?\s*(.+)$/i);
    const explainMatch = line.match(/^(?:【?解析】?|答案解析)\s*[:：]?\s*(.*)$/i);
    const pointMatch = line.match(/^(?:【?知识点】?|考点)\s*[:：]?\s*(.*)$/i);
    if (qMatch) {
      flush();
      current = {number: qMatch[1], stem: qMatch[2].trim(), options: [], answerRaw: "", explanation: "", point: ""};
    } else if (optionMatch && current) {
      const key = optionKey(optionMatch[1]);
      current.options.push({key, text: optionMatch[2].trim()});
    } else if (answerMatch && current) current.answerRaw = answerMatch[1];
    else if (explainMatch && current) current.explanation = explainMatch[1].trim();
    else if (pointMatch && current) current.point = pointMatch[1].trim();
    else if (current) {
      if (!current.options.length) current.stem += ` ${line}`;
      else if (current.explanation) current.explanation += ` ${line}`;
    }
  }
  flush();
  questions.diagnostics = diagnostics;
  return questions;
}

async function extractDocx(file) {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("无法读取这个 Word 文件");
  const count = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  let target = null;
  for (let i = 0; i < count; i++) {
    if (view.getUint32(offset, true) !== 0x02014b50) break;
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const fileNameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = new TextDecoder().decode(bytes.slice(offset + 46, offset + 46 + fileNameLength));
    if (name === "word/document.xml") target = {method, compressedSize, localOffset};
    offset += 46 + fileNameLength + extraLength + commentLength;
  }
  if (!target) throw new Error("Word 文件中没有正文");
  const nameLength = view.getUint16(target.localOffset + 26, true);
  const extraLength = view.getUint16(target.localOffset + 28, true);
  const start = target.localOffset + 30 + nameLength + extraLength;
  let data = bytes.slice(start, start + target.compressedSize);
  if (target.method === 8) {
    const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    data = new Uint8Array(await new Response(stream).arrayBuffer());
  } else if (target.method !== 0) throw new Error("浏览器暂不支持这个 Word 压缩格式");
  const xml = new TextDecoder().decode(data);
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const nodeText = node => [...node.getElementsByTagName("w:t")].map(t => t.textContent).join("").trim();
  const body = doc.getElementsByTagName("w:body")[0];
  const blocks = [];
  for (const child of body?.children || []) {
    if (child.localName === "p") {
      const value = nodeText(child);
      if (value) blocks.push(value);
    } else if (child.localName === "tbl") {
      for (const row of child.getElementsByTagName("w:tr")) {
        const cells = [...row.getElementsByTagName("w:tc")].map(nodeText);
        if (cells.some(Boolean)) blocks.push(cells.join("\t"));
      }
    }
  }
  return blocks.join("\n");
}

async function extractPdf(file) {
  const pdf = await pdfjsLib.getDocument({data: new Uint8Array(await file.arrayBuffer())}).promise;
  const pages = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    let pageText = "";
    for (const item of content.items) pageText += item.str + (item.hasEOL ? "\n" : " ");
    pages.push(pageText);
  }
  return pages.join("\n");
}

async function readFileText(file) {
  const ext = file.name.split(".").pop().toLowerCase();
  if (ext === "docx") return extractDocx(file);
  if (ext === "pdf") return extractPdf(file);
  return file.text();
}

function importQuestions(questions) {
  if (!questions.length) return 0;
  state.importedRealBank = true;
  const signatures = new Set(realQuestions().map(q => q.stem.replace(/\s+/g, "").toLowerCase()));
  const unique = questions.filter(q => {
    const signature = q.stem.replace(/\s+/g, "").toLowerCase();
    if (signatures.has(signature)) return false;
    signatures.add(signature);
    return true;
  });
  state.questions.push(...unique);
  saveState();
  return unique.length;
}

async function handleFiles(files) {
  const feedback = document.querySelector("#importFeedback");
  feedback.hidden = false;
  let questionCount = 0;
  let materialCount = 0;
  let failures = [];
  let notices = [];
  for (const file of files) {
    try {
      feedback.textContent = `正在解析：${file.name}`;
      if (file.name.toLowerCase().endsWith(".json")) {
        const json = JSON.parse(await file.text());
        if (Array.isArray(json.questions) && json.progress && json.daily) {
          state = {...structuredClone(defaultState), ...json};
          state.questions = json.questions;
          state.materials = Array.isArray(json.materials) ? json.materials : [];
          state.importedRealBank = state.questions.some(q => !q.demo);
          saveState();
          questionCount += state.questions.length;
          materialCount += state.materials.length;
          continue;
        }
        const candidate = Array.isArray(json) ? json : json.questions;
        if (Array.isArray(candidate)) {
          const normalized = candidate.map(q => ({...q, id: q.id || uid(), source: q.source || file.name, answer: Array.isArray(q.answer) ? q.answer : normalizeAnswer(q.answer), options: q.options || []}));
          questionCount += importQuestions(normalized.filter(q => q.stem && q.options.length >= 2 && q.answer.length));
          continue;
        }
      }
      const raw = await readFileText(file);
      const questions = parseQuestionText(raw, file.name);
      if (questions.length) questionCount += importQuestions(questions);
      else if (raw.trim().length > 80) {
        state.materials.push({id: uid(), name: file.name, text: raw.trim(), createdAt: Date.now()});
        materialCount += 1;
        const info = questions.diagnostics || {};
        if (info.missingAnswers) notices.push(`${file.name}：识别到 ${info.missingAnswers} 道选择题结构，但正文中没有可读取的答案，已先保存为复习资料`);
        else notices.push(`${file.name}：提取到了文字，但没有找到“题号 + 至少两个选项 + 答案”的完整结构，已保存为复习资料`);
      } else {
        const isPdf = file.name.toLowerCase().endsWith(".pdf");
        failures.push(`${file.name}：${isPdf ? "几乎没有可提取文字，可能是扫描版 PDF，需要先做 OCR" : "未提取到足够文字"}`);
      }
    } catch (error) {
      failures.push(`${file.name}：${error.message}`);
    }
  }
  saveState();
  renderAll();
  feedback.innerHTML = `已导入 <strong>${questionCount}</strong> 道新题，保存 <strong>${materialCount}</strong> 份复习资料。${notices.length ? `<br>${escapeHtml(notices.join("；"))}` : ""}${failures.length ? `<br>${escapeHtml(failures.join("；"))}` : ""}`;
  showToast(`导入完成：${questionCount} 道题，${materialCount} 份资料`);
}

function importPastedText() {
  const raw = document.querySelector("#pasteInput").value.trim();
  if (!raw) { showToast("请先粘贴题库文本"); return; }
  const questions = parseQuestionText(raw, "粘贴导入");
  const feedback = document.querySelector("#importFeedback");
  feedback.hidden = false;
  if (questions.length) {
    const added = importQuestions(questions);
    feedback.innerHTML = `识别到 ${questions.length} 道题，成功加入 ${added} 道，重复题已自动跳过。`;
    document.querySelector("#pasteInput").value = "";
    showToast(`已导入 ${added} 道题`);
  } else if (raw.length > 80) {
    state.materials.push({id: uid(), name: `粘贴资料 ${new Date().toLocaleString()}`, text: raw, createdAt: Date.now()});
    saveState();
    const info = questions.diagnostics || {};
    feedback.textContent = info.missingAnswers
      ? `识别到 ${info.missingAnswers} 道选择题结构，但没有找到答案，已作为复习资料保存。`
      : "没有找到“题号 + 至少两个选项 + 答案”的完整结构，已作为复习资料保存。";
    showToast("已保存为复习资料");
  } else feedback.textContent = "没有识别到完整题目。请检查题号、选项和答案的格式。";
  renderAll();
}

function exportBackup() {
  const blob = new Blob([JSON.stringify({...state, exportedAt: new Date().toISOString()}, null, 2)], {type: "application/json"});
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `青苗题库备份-${todayKey()}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
  showToast("备份文件已导出");
}

document.addEventListener("click", event => {
  const viewButton = event.target.closest("[data-view]");
  if (viewButton) navigate(viewButton.dataset.view);
  const practiceButton = event.target.closest("[data-practice]");
  if (practiceButton) startPractice(practiceButton.dataset.practice);
  const one = event.target.closest("[data-practice-one]");
  if (one) {
    const q = realQuestions().find(item => item.id === one.dataset.practiceOne);
    if (q) startPractice("single", [q]);
  }
  const point = event.target.closest("[data-practice-point]");
  if (point) startPractice("point", realQuestions().filter(q => (q.point || "未分类知识点") === point.dataset.practicePoint));
  const remove = event.target.closest("[data-delete-question]");
  if (remove && confirm("确定从题库中删除这道题吗？")) {
    state.questions = state.questions.filter(q => q.id !== remove.dataset.deleteQuestion);
    delete state.progress[remove.dataset.deleteQuestion];
    saveState(); renderAll(); showToast("题目已删除");
  }
  if (event.target.closest("[data-action='open-import']")) document.querySelector("#importDialog").showModal();
  if (event.target.closest("[data-action='show-contact']")) {
    navigate("home");
    setTimeout(() => document.querySelector("#contactSection")?.scrollIntoView({behavior: "smooth", block: "center"}), 80);
  }
  const reviewTab = event.target.closest("[data-review-filter]");
  if (reviewTab) { reviewFilter = reviewTab.dataset.reviewFilter; renderReview(); }
  const option = event.target.closest("[data-option]");
  if (option) selectOption(option.dataset.option);
});

document.querySelector("#exitPracticeButton").addEventListener("click", closePractice);
document.querySelector("#submitAnswerButton").addEventListener("click", submitAnswer);
document.querySelector("#nextQuestionButton").addEventListener("click", nextQuestion);
document.querySelector("#skipButton").addEventListener("click", skipQuestion);
document.querySelector("#starQuestionButton").addEventListener("click", () => {
  if (!session) return;
  const q = session.questions[session.index];
  const next = !getProgress(q.id).starred;
  setProgress(q.id, {starred: next});
  document.querySelector("#starQuestionButton").classList.toggle("active", next);
  document.querySelector("#starQuestionButton").textContent = next ? "已收藏" : "收藏";
  renderAll();
});
document.querySelector("#questionNote").addEventListener("input", () => {
  clearTimeout(pendingNoteTimer);
  pendingNoteTimer = setTimeout(saveCurrentNote, 350);
});
document.querySelector("#bankSearch").addEventListener("input", renderBank);
document.querySelector("#sourceFilter").addEventListener("change", renderBank);
document.querySelector("#materialSearch").addEventListener("input", renderMaterialResults);
document.querySelector("#exportButton").addEventListener("click", exportBackup);
document.querySelector("#clearDataButton").addEventListener("click", () => {
  const confirmed = confirm("确定清空个人导入的题目、资料，以及本设备上的答题进度、错题、收藏和笔记吗？公共题库不会被删除。此操作无法撤销。 ");
  if (!confirmed) return;
  state = {
    questions: [],
    materials: [],
    progress: {},
    dailyGoal: 20,
    daily: {},
    importedRealBank: true
  };
  saveState();
  renderAll();
  showToast("本地题库和学习记录已清空");
});
document.querySelector("#parsePasteButton").addEventListener("click", event => { event.preventDefault(); importPastedText(); });
document.querySelector("#fileInput").addEventListener("change", event => handleFiles([...event.target.files]));
document.querySelector("#focusPracticeButton").addEventListener("click", () => {
  const weakest = getPointStats()[0];
  if (!weakest) showToast("导入题库后才能生成知识点专项练习");
  else startPractice("point", weakest.questions);
});

const dropZone = document.querySelector("#dropZone");
["dragenter", "dragover"].forEach(type => dropZone.addEventListener(type, event => { event.preventDefault(); dropZone.classList.add("dragging"); }));
["dragleave", "drop"].forEach(type => dropZone.addEventListener(type, event => { event.preventDefault(); dropZone.classList.remove("dragging"); }));
dropZone.addEventListener("drop", event => handleFiles([...event.dataTransfer.files]));

document.addEventListener("keydown", event => {
  if (!session) return;
  if (/^[1-8]$/.test(event.key) && !session.locked) {
    const q = session.questions[session.index];
    const option = q.options[Number(event.key) - 1];
    if (option) selectOption(option.key);
  }
  if (event.key === "Enter" && event.target.tagName !== "TEXTAREA") {
    event.preventDefault();
    session.locked ? nextQuestion() : submitAnswer();
  }
  if (event.key === "Escape") closePractice();
});

async function loadPublicSite() {
  try {
    const [bankResponse, configResponse] = await Promise.all([
      fetch("./data/question-bank.json", {cache: "no-cache"}),
      fetch("./data/site-config.json", {cache: "no-cache"})
    ]);
    if (bankResponse.ok) {
      const bank = await bankResponse.json();
      sharedQuestions = Array.isArray(bank.questions) ? bank.questions : [];
      sharedMaterials = Array.isArray(bank.materials) ? bank.materials : [];
    }
    if (configResponse.ok) siteConfig = await configResponse.json();
  } catch (error) {
    console.warn("公共题库加载失败，将使用本机数据。", error);
  }

  if (!sharedQuestions.length && !state.questions.length) sharedQuestions = demoQuestions;
  applySiteConfig();
  renderAll();
}

function applySiteConfig() {
  if (siteConfig.siteName) {
    document.title = `${siteConfig.siteName} | 毛概刷题`;
    document.querySelector(".brand strong").textContent = siteConfig.siteName;
  }
  if (siteConfig.subtitle) document.querySelector(".brand small").textContent = siteConfig.subtitle;
  if (siteConfig.contactTitle) text("#contactTitle", siteConfig.contactTitle);
  if (siteConfig.contactText) text("#contactText", siteConfig.contactText);
  if (siteConfig.ownerName) text("#contactOwner", siteConfig.ownerName);
  const qr = document.querySelector("#wechatQr");
  const placeholder = document.querySelector("#qrPlaceholder");
  if (siteConfig.wechatQr) {
    qr.src = siteConfig.wechatQr;
    qr.hidden = false;
    placeholder.hidden = true;
    qr.addEventListener("error", () => { qr.hidden = true; placeholder.hidden = false; }, {once: true});
  }
}

loadPublicSite();
