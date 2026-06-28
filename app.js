(function () {
  const STORAGE_KEY = "marxQuizState.v1";
  const WRONG_KEY = "marxQuizWrong.v1";

  const els = {
    fileInput: document.getElementById("fileInput"),
    loadSampleBtn: document.getElementById("loadSampleBtn"),
    practiceViewBtn: document.getElementById("practiceViewBtn"),
    wrongbookViewBtn: document.getElementById("wrongbookViewBtn"),
    practiceView: document.getElementById("practiceView"),
    wrongbookView: document.getElementById("wrongbookView"),
    bankMeta: document.getElementById("bankMeta"),
    chapterList: document.getElementById("chapterList"),
    modeButtons: Array.from(document.querySelectorAll("[data-mode]")),
    statPosition: document.getElementById("statPosition"),
    statAccuracy: document.getElementById("statAccuracy"),
    statCorrect: document.getElementById("statCorrect"),
    statWrong: document.getElementById("statWrong"),
    prevBtn: document.getElementById("prevBtn"),
    nextBtn: document.getElementById("nextBtn"),
    shuffleBtn: document.getElementById("shuffleBtn"),
    resetBtn: document.getElementById("resetBtn"),
    questionChapter: document.getElementById("questionChapter"),
    questionType: document.getElementById("questionType"),
    questionText: document.getElementById("questionText"),
    options: document.getElementById("options"),
    submitBtn: document.getElementById("submitBtn"),
    showAnswerBtn: document.getElementById("showAnswerBtn"),
    feedback: document.getElementById("feedback"),
    wrongList: document.getElementById("wrongList"),
    previewWrongAnswersBtn: document.getElementById("previewWrongAnswersBtn"),
    exportWrongJsonBtn: document.getElementById("exportWrongJsonBtn"),
    exportWrongTxtBtn: document.getElementById("exportWrongTxtBtn"),
    clearWrongBtn: document.getElementById("clearWrongBtn"),
  };

  const state = {
    bank: null,
    activeChapter: "全部",
    view: "practice",
    mode: "all",
    order: [],
    position: 0,
    selected: [],
    answered: {},
    correct: 0,
    totalAnswered: 0,
    wrongNotebook: readJson(WRONG_KEY, {}),
    reveal: false,
    autoRevealWrong: false,
    lastFeedback: null,
  };

  bindEvents();
  if (window.SAMPLE_QUESTION_BANK) {
    loadBank(JSON.stringify(window.SAMPLE_QUESTION_BANK), "内置样例.json");
  } else {
    render();
  }

  function bindEvents() {
    els.fileInput.addEventListener("change", handleFileImport);
    els.loadSampleBtn.addEventListener("click", () => loadBank(JSON.stringify(window.SAMPLE_QUESTION_BANK || {}), "内置样例.json"));
    els.practiceViewBtn.addEventListener("click", () => switchView("practice"));
    els.wrongbookViewBtn.addEventListener("click", () => switchView("wrongbook"));
    els.modeButtons.forEach((button) => {
      button.addEventListener("click", () => {
        state.mode = button.dataset.mode;
        state.view = "practice";
        state.position = 0;
        state.selected = [];
        state.reveal = false;
        state.autoRevealWrong = false;
        state.lastFeedback = null;
        rebuildOrder();
        render();
      });
    });
    els.prevBtn.addEventListener("click", () => move(-1));
    els.nextBtn.addEventListener("click", () => move(1));
    els.shuffleBtn.addEventListener("click", shuffleCurrent);
    els.resetBtn.addEventListener("click", resetProgress);
    els.submitBtn.addEventListener("click", submitAnswer);
    els.showAnswerBtn.addEventListener("click", revealAnswer);
    els.previewWrongAnswersBtn.addEventListener("click", enterWrongAnswerPreview);
    els.exportWrongJsonBtn.addEventListener("click", () => exportWrongNotebook("json"));
    els.exportWrongTxtBtn.addEventListener("click", () => exportWrongNotebook("txt"));
    els.clearWrongBtn.addEventListener("click", clearCurrentWrongChapter);
    document.addEventListener("keydown", handleKeyboard);
  }

  function handleFileImport(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        loadBank(String(reader.result), file.name);
      } catch (error) {
        alert(error.message);
      }
    };
    reader.readAsText(file, "utf-8");
    event.target.value = "";
  }

  function loadBank(raw, fileName) {
    state.bank = QuizCore.parseQuestionBank(raw, fileName);
    state.activeChapter = "全部";
    state.view = "practice";
    state.mode = "all";
    state.position = 0;
    state.selected = [];
    state.answered = {};
    state.correct = 0;
    state.totalAnswered = 0;
    state.reveal = false;
    state.autoRevealWrong = false;
    state.lastFeedback = null;
    rebuildOrder();
    saveState();
    render();
  }

  function rebuildOrder() {
    if (!state.bank) {
      state.order = [];
      return;
    }

    let questions = state.bank.questions;
    if (state.activeChapter !== "全部") {
      questions = questions.filter((question) => question.chapter === state.activeChapter);
    }
    if (state.mode === "single" || state.mode === "multiple") {
      questions = questions.filter((question) => question.type === state.mode);
    }
    if (state.mode === "wrong") {
      const chapters = state.activeChapter === "全部"
        ? Object.keys(state.wrongNotebook)
        : [state.activeChapter];
      questions = chapters.flatMap((chapter) => state.wrongNotebook[chapter] || []);
    }

    state.order = questions.map((question) => question.id);
    if (state.position >= state.order.length) state.position = Math.max(0, state.order.length - 1);
  }

  function switchView(view) {
    state.view = view;
    if (view === "practice" && state.mode === "wrong") {
      state.mode = "all";
      state.position = 0;
      state.selected = [];
      state.reveal = false;
      state.autoRevealWrong = false;
      state.lastFeedback = null;
      rebuildOrder();
    }
    render();
  }

  function getCurrentQuestion() {
    if (!state.bank || !state.order.length) return null;
    const id = state.order[state.position];
    if (state.mode === "wrong") {
      return Object.values(state.wrongNotebook).flat().find((question) => question.id === id) || null;
    }
    return state.bank.questions.find((question) => question.id === id) || null;
  }

  function render() {
    renderChapters();
    renderView();
    renderModeButtons();
    renderQuestion();
    renderStats();
    renderWrongList();
  }

  function renderView() {
    els.practiceView.classList.toggle("hidden", state.view !== "practice");
    els.wrongbookView.classList.toggle("hidden", state.view !== "wrongbook");
    els.practiceViewBtn.classList.toggle("active", state.view === "practice");
    els.wrongbookViewBtn.classList.toggle("active", state.view === "wrongbook");
  }

  function renderChapters() {
    const chapters = state.bank ? ["全部"].concat(state.bank.chapters) : ["全部"];
    els.chapterList.innerHTML = "";
    chapters.forEach((chapter) => {
      const count = countChapterQuestions(chapter);
      const button = document.createElement("button");
      button.type = "button";
      button.className = chapter === state.activeChapter ? "active" : "";
      button.textContent = `${chapter} (${count})`;
      button.addEventListener("click", () => {
        state.activeChapter = chapter;
        state.position = 0;
        state.selected = [];
        state.reveal = state.autoRevealWrong && state.mode === "wrong";
        state.lastFeedback = null;
        rebuildOrder();
        render();
      });
      els.chapterList.appendChild(button);
    });
  }

  function countChapterQuestions(chapter) {
    if (!state.bank) return 0;
    if (state.mode === "wrong" || state.view === "wrongbook") {
      if (chapter === "全部") return Object.values(state.wrongNotebook).reduce((sum, list) => sum + list.length, 0);
      return (state.wrongNotebook[chapter] || []).length;
    }
    return state.bank.questions.filter((question) => chapter === "全部" || question.chapter === chapter).length;
  }

  function renderModeButtons() {
    els.modeButtons.forEach((button) => {
      button.classList.toggle("active", button.dataset.mode === state.mode);
    });
  }

  function renderQuestion() {
    const question = getCurrentQuestion();
    els.options.innerHTML = "";
    els.feedback.textContent = "";
    els.feedback.className = "";

    if (!question) {
      els.bankMeta.textContent = state.bank ? `${state.bank.source}：${state.bank.total} 题` : "导入 JSON 或 TXT 开始刷题";
      els.questionChapter.textContent = state.activeChapter;
      els.questionType.textContent = "无题目";
      els.questionText.textContent = state.bank ? "当前范围没有题目" : "请先导入题库";
      els.submitBtn.disabled = true;
      els.showAnswerBtn.disabled = true;
      return;
    }

    els.bankMeta.textContent = `${state.bank.source}：${state.bank.total} 题`;
    els.questionChapter.textContent = question.chapter;
    els.questionType.textContent = question.type === "multiple" ? "多选" : "单选";
    els.questionText.textContent = `${question.number ? question.number + ". " : ""}${question.question}`;
    if (state.mode === "wrong" && state.autoRevealWrong) state.reveal = true;
    const answerPreview = state.mode === "wrong" && state.autoRevealWrong;
    els.submitBtn.disabled = answerPreview;
    els.showAnswerBtn.disabled = answerPreview;

    Object.entries(question.options).forEach(([letter, text]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "option";
      if (state.selected.includes(letter)) button.classList.add("selected");
      if (state.reveal && question.answer.includes(letter)) button.classList.add("correct");
      if (state.reveal && state.selected.includes(letter) && !question.answer.includes(letter)) button.classList.add("wrong");
      button.innerHTML = `<span class="letter">${letter}</span><span>${escapeHtml(text)}</span>`;
      button.addEventListener("click", () => toggleOption(letter));
      els.options.appendChild(button);
    });

    if (state.reveal) {
      const right = question.answer.join("");
      if (state.lastFeedback && state.lastFeedback.id === question.id) {
        els.feedback.textContent = state.lastFeedback.text;
        els.feedback.className = state.lastFeedback.className;
      } else {
        els.feedback.textContent = `答案：${right}`;
        els.feedback.className = "ok";
      }
    }
  }

  function renderStats() {
    const wrongCount = Object.values(state.wrongNotebook).reduce((sum, list) => sum + list.length, 0);
    const accuracy = state.totalAnswered ? Math.round((state.correct / state.totalAnswered) * 100) : 0;
    els.statPosition.textContent = `${state.order.length ? state.position + 1 : 0}/${state.order.length}`;
    els.statAccuracy.textContent = `正确率 ${accuracy}%`;
    els.statCorrect.textContent = `答对 ${state.correct}`;
    els.statWrong.textContent = `错题 ${wrongCount}`;
  }

  function renderWrongList() {
    const chapters = state.activeChapter === "全部" ? Object.keys(state.wrongNotebook) : [state.activeChapter];
    const items = chapters.flatMap((chapter) => (state.wrongNotebook[chapter] || []).map((question) => ({ chapter, question })));
    els.wrongList.innerHTML = "";

    if (!items.length) {
      els.wrongList.innerHTML = '<p class="empty">当前没有错题。</p>';
      return;
    }

    items.forEach(({ chapter, question }) => {
      const item = document.createElement("div");
      item.className = "wrongItem";
      item.innerHTML = `
        <p><strong>${escapeHtml(chapter)} ${question.number || ""}</strong> ${escapeHtml(question.question)}</p>
        <p>答案：${question.answer.join("")}；上次选：${(question.lastChoice || []).join("") || "未记录"}</p>
        <div class="wrongActions">
          <button type="button" data-jump="${escapeHtml(question.id)}">去练这题</button>
          <button type="button" data-remove="${escapeHtml(question.id)}" data-chapter="${escapeHtml(chapter)}">移出错题本</button>
        </div>
      `;
      els.wrongList.appendChild(item);
    });

    els.wrongList.querySelectorAll("[data-jump]").forEach((button) => {
      button.addEventListener("click", () => jumpToWrong(button.dataset.jump));
    });
    els.wrongList.querySelectorAll("[data-remove]").forEach((button) => {
      button.addEventListener("click", () => {
        state.wrongNotebook = QuizCore.removeWrongQuestion(state.wrongNotebook, button.dataset.remove, button.dataset.chapter);
        saveWrong();
        rebuildOrder();
        render();
      });
    });
  }

  function toggleOption(letter) {
    const question = getCurrentQuestion();
    if (!question) return;
    if (state.mode === "wrong" && state.autoRevealWrong) return;
    state.reveal = false;
    state.autoRevealWrong = false;
    if (question.type === "single") {
      state.selected = [letter];
      submitAnswer();
      return;
    }
    state.selected = state.selected.includes(letter)
      ? state.selected.filter((item) => item !== letter)
      : state.selected.concat(letter).sort();
    renderQuestion();
  }

  function submitAnswer() {
    const question = getCurrentQuestion();
    if (!question) return;
    if (!state.selected.length) {
      els.feedback.textContent = "先选一个答案。";
      els.feedback.className = "bad";
      return;
    }

    const firstTry = !state.answered[question.id];
    const correct = QuizCore.isCorrectAnswer(question.answer, state.selected);
    state.reveal = true;
    state.answered[question.id] = true;
    if (firstTry) {
      state.totalAnswered += 1;
      if (correct) state.correct += 1;
    }

    if (correct) {
      state.lastFeedback = {
        id: question.id,
        text: `答对了。答案：${question.answer.join("")}`,
        className: "ok",
      };
    } else {
      state.wrongNotebook = QuizCore.addWrongQuestion(state.wrongNotebook, question, state.selected);
      saveWrong();
      state.lastFeedback = {
        id: question.id,
        text: `答错了，已加入 ${question.chapter} 错题本。答案：${question.answer.join("")}`,
        className: "bad",
      };
    }
    saveState();
    render();
  }

  function revealAnswer() {
    state.reveal = true;
    state.lastFeedback = null;
    renderQuestion();
  }

  function move(step) {
    if (!state.order.length) return;
    state.position = (state.position + step + state.order.length) % state.order.length;
    state.selected = [];
    state.reveal = state.autoRevealWrong && state.mode === "wrong";
    state.lastFeedback = null;
    render();
  }

  function shuffleCurrent() {
    for (let index = state.order.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [state.order[index], state.order[swapIndex]] = [state.order[swapIndex], state.order[index]];
    }
    state.position = 0;
    state.selected = [];
    state.reveal = state.autoRevealWrong && state.mode === "wrong";
    state.lastFeedback = null;
    render();
  }

  function resetProgress() {
    state.selected = [];
    state.answered = {};
    state.correct = 0;
    state.totalAnswered = 0;
    state.reveal = false;
    state.autoRevealWrong = false;
    state.lastFeedback = null;
    saveState();
    render();
  }

  function jumpToWrong(id) {
    state.view = "practice";
    state.mode = "wrong";
    state.autoRevealWrong = false;
    rebuildOrder();
    const index = state.order.indexOf(id);
    state.position = Math.max(0, index);
    state.selected = [];
    state.reveal = false;
    state.lastFeedback = null;
    render();
  }

  function enterWrongAnswerPreview() {
    const count = state.activeChapter === "全部"
      ? Object.values(state.wrongNotebook).reduce((sum, list) => sum + list.length, 0)
      : (state.wrongNotebook[state.activeChapter] || []).length;
    if (!count) {
      alert("当前章节没有错题可速览。");
      return;
    }

    state.view = "practice";
    state.mode = "wrong";
    state.autoRevealWrong = true;
    state.position = 0;
    state.selected = [];
    state.reveal = true;
    state.lastFeedback = null;
    rebuildOrder();
    render();
  }

  function clearCurrentWrongChapter() {
    if (state.activeChapter === "全部") {
      state.wrongNotebook = {};
    } else {
      delete state.wrongNotebook[state.activeChapter];
    }
    saveWrong();
    rebuildOrder();
    render();
  }

  function exportWrongNotebook(format) {
    const exported = QuizCore.buildWrongNotebookExport(state.wrongNotebook, {
      source: state.bank ? state.bank.source : "",
      activeChapter: state.activeChapter,
    });

    if (!exported.summary.questionCount) {
      alert("当前没有错题可导出。");
      return;
    }

    const date = exported.exportedAt.slice(0, 10);
    const scope = state.activeChapter === "全部" ? "全部章节" : state.activeChapter;
    if (format === "json") {
      downloadText(
        `马克思错题本-${scope}-${date}.json`,
        JSON.stringify(exported, null, 2),
        "application/json;charset=utf-8",
      );
      return;
    }

    downloadText(
      `马克思错题本-${scope}-${date}.txt`,
      QuizCore.formatWrongNotebookTxt(exported),
      "text/plain;charset=utf-8",
    );
  }

  function downloadText(fileName, content, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function handleKeyboard(event) {
    if (event.target && ["INPUT", "TEXTAREA"].includes(event.target.tagName)) return;
    const keyMap = {
      "1": "A",
      "2": "B",
      "3": "C",
      "4": "D",
      "5": "E",
      Numpad1: "A",
      Numpad2: "B",
      Numpad3: "C",
      Numpad4: "D",
      Numpad5: "E",
    };
    const letter = keyMap[event.key] || keyMap[event.code];
    if (letter) {
      event.preventDefault();
      toggleOption(letter);
    }
    if (event.key === "Enter") submitAnswer();
    if (event.key === "ArrowRight") move(1);
    if (event.key === "ArrowLeft") move(-1);
  }

  function saveState() {
    const snapshot = {
      correct: state.correct,
      totalAnswered: state.totalAnswered,
      answered: state.answered,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  }

  function saveWrong() {
    localStorage.setItem(WRONG_KEY, JSON.stringify(state.wrongNotebook));
  }

  function readJson(key, fallback) {
    try {
      return JSON.parse(localStorage.getItem(key)) || fallback;
    } catch (_) {
      return fallback;
    }
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
})();
