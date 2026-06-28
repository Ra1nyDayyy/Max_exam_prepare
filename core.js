(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.QuizCore = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  const LETTERS = ["A", "B", "C", "D", "E"];

  function parseQuestionBank(rawText, fileName) {
    const text = String(rawText || "").trim();
    if (!text) {
      throw new Error("文件内容为空");
    }

    if (looksLikeJson(fileName, text)) {
      return normalizeJsonBank(JSON.parse(text), fileName);
    }

    return parseTxtBank(text, fileName);
  }

  function looksLikeJson(fileName, text) {
    return /\.json$/i.test(fileName || "") || text.startsWith("{") || text.startsWith("[");
  }

  function normalizeJsonBank(data, fileName) {
    const questions = [];

    if (Array.isArray(data)) {
      data.forEach((item, index) => {
        questions.push(normalizeQuestion(item, {
          chapter: item.chapter || "未分章",
          type: inferType(item),
          number: item.number || index + 1,
        }));
      });
    } else if (Array.isArray(data.chapters)) {
      data.chapters.forEach((chapterBlock) => {
        const chapter = chapterBlock.chapter || chapterBlock.name || "未分章";
        addQuestionGroup(questions, chapterBlock.single_choice, chapter, "single");
        addQuestionGroup(questions, chapterBlock.multiple_choice, chapter, "multiple");
        addQuestionGroup(questions, chapterBlock.questions, chapter, null);
      });
    } else if (Array.isArray(data.questions)) {
      data.questions.forEach((item, index) => {
        questions.push(normalizeQuestion(item, {
          chapter: item.chapter || "未分章",
          type: inferType(item),
          number: item.number || index + 1,
        }));
      });
    } else {
      throw new Error("JSON 里没有找到题目数组");
    }

    return buildBank(questions, fileName);
  }

  function addQuestionGroup(target, group, chapter, forcedType) {
    if (!Array.isArray(group)) return;
    group.forEach((item, index) => {
      target.push(normalizeQuestion(item, {
        chapter,
        type: forcedType || inferType(item),
        number: item.number || index + 1,
      }));
    });
  }

  function normalizeQuestion(item, fallback) {
    const answer = normalizeAnswer(item.answer || item.answers || item.correct || item.correctAnswer);
    const options = normalizeOptions(item.options || item.choices || item);
    const type = fallback.type || (answer.length > 1 ? "multiple" : "single");
    const chapter = String(item.chapter || fallback.chapter || "未分章").trim() || "未分章";
    const number = item.number || fallback.number || 0;
    const question = cleanQuestionText(item.question || item.title || item.stem || item.question_with_answer || "");

    if (!question) {
      throw new Error(`第 ${number} 题缺少题干`);
    }
    if (!answer.length) {
      throw new Error(`第 ${number} 题缺少答案`);
    }
    if (Object.keys(options).length < 2) {
      throw new Error(`第 ${number} 题缺少选项`);
    }

    return {
      id: item.id || `${chapter}-${type}-${number}`,
      chapter,
      type,
      number,
      question,
      options,
      answer,
    };
  }

  function cleanQuestionText(text) {
    return String(text || "")
      .replace(/答案[:：]?\s*[A-D]+/gi, "")
      .replace(/[（(]\s*[A-D]+\s*[）)]/g, "（ ）")
      .trim();
  }

  function normalizeOptions(source) {
    const options = {};
    LETTERS.forEach((letter) => {
      const value = source && source[letter];
      if (value !== undefined && value !== null && String(value).trim()) {
        options[letter] = String(value).trim();
      }
    });
    return options;
  }

  function normalizeAnswer(answer) {
    if (Array.isArray(answer)) {
    return answer.map(String).join("").toUpperCase().match(/[A-E]/g) || [];
    }
    return String(answer || "").toUpperCase().match(/[A-E]/g) || [];
  }

  function inferType(item) {
    return normalizeAnswer(item.answer || item.answers || item.correct || item.correctAnswer).length > 1 ? "multiple" : "single";
  }

  function parseTxtBank(text, fileName) {
    const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const questions = [];
    let chapter = "未分章";
    let current = null;

    lines.forEach((line) => {
      const chapterName = parseChapterLine(line);
      if (chapterName && !current) {
        chapter = chapterName;
        return;
      }

      const questionMatch = line.match(/^(\d+)[\.、]\s*(.+)$/);
      if (questionMatch) {
        if (current) questions.push(finishTxtQuestion(current));
        current = {
          chapter,
          number: Number(questionMatch[1]),
          question: questionMatch[2].trim(),
          options: {},
          answer: [],
        };
        return;
      }

      const optionMatch = line.match(/^([A-D])[\.\、\s]\s*(.+)$/i);
      if (optionMatch && current) {
        current.options[optionMatch[1].toUpperCase()] = optionMatch[2].trim();
        return;
      }

      const answerMatch = line.match(/^(答案|正确答案|参考答案)\s*[:：]?\s*([A-D\s,，、]+)/i);
      if (answerMatch && current) {
        current.answer = normalizeAnswer(answerMatch[2]);
        return;
      }

      if (current) {
        current.question = `${current.question}${current.question.endsWith("。") ? "" : " "}${line}`.trim();
      }
    });

    if (current) questions.push(finishTxtQuestion(current));
    if (!questions.length) {
      throw new Error("TXT 中没有识别到题目。请使用“1. 题干 / A. 选项 / 答案：A”的格式。");
    }

    return buildBank(questions, fileName);
  }

  function parseChapterLine(line) {
    if (/^(导论|绪论|第[一二三四五六七八九十\d]+章)/.test(line)) return line;
    if (/^#+\s*/.test(line)) return line.replace(/^#+\s*/, "");
    return "";
  }

  function finishTxtQuestion(item) {
    return normalizeQuestion(item, {
      chapter: item.chapter,
      number: item.number,
      type: item.answer.length > 1 ? "multiple" : "single",
    });
  }

  function buildBank(questions, fileName) {
    const cleanQuestions = questions.map((question, index) => ({
      ...question,
      id: question.id || `${question.chapter}-${question.type}-${question.number || index + 1}`,
      index,
    }));
    const chapters = [];
    cleanQuestions.forEach((question) => {
      if (!chapters.includes(question.chapter)) chapters.push(question.chapter);
    });
    return {
      source: fileName || "导入题库",
      questions: cleanQuestions,
      chapters,
      total: cleanQuestions.length,
    };
  }

  function isCorrectAnswer(answer, selected) {
    const a = normalizeAnswer(answer).sort().join("");
    const b = normalizeAnswer(selected).sort().join("");
    return a.length > 0 && a === b;
  }

  function addWrongQuestion(notebook, question, selected) {
    const next = JSON.parse(JSON.stringify(notebook || {}));
    const chapter = question.chapter || "未分章";
    const list = next[chapter] || [];
    const saved = {
      ...question,
      lastChoice: normalizeAnswer(selected),
      wrongAt: new Date().toISOString(),
    };
    const existingIndex = list.findIndex((item) => item.id === question.id);
    if (existingIndex >= 0) {
      list[existingIndex] = saved;
    } else {
      list.push(saved);
    }
    next[chapter] = list;
    return next;
  }

  function removeWrongQuestion(notebook, questionId, chapter) {
    const next = JSON.parse(JSON.stringify(notebook || {}));
    if (!next[chapter]) return next;
    next[chapter] = next[chapter].filter((item) => item.id !== questionId);
    if (!next[chapter].length) delete next[chapter];
    return next;
  }

  function buildWrongNotebookExport(notebook, options) {
    const source = (options && options.source) || "";
    const activeChapter = (options && options.activeChapter) || "全部";
    const exportedAt = (options && options.exportedAt) || new Date().toISOString();
    const safeNotebook = notebook || {};
    const chapterNames = activeChapter && activeChapter !== "全部"
      ? [activeChapter]
      : Object.keys(safeNotebook);
    const chapters = chapterNames
      .map((chapter) => ({
        chapter,
        questions: JSON.parse(JSON.stringify(safeNotebook[chapter] || [])),
      }))
      .filter((chapterBlock) => chapterBlock.questions.length > 0);
    const questionCount = chapters.reduce((sum, chapterBlock) => sum + chapterBlock.questions.length, 0);

    return {
      version: 1,
      exportedAt,
      source,
      activeChapter,
      summary: {
        chapterCount: chapters.length,
        questionCount,
      },
      chapters,
    };
  }

  function formatWrongNotebookTxt(exported) {
    const data = exported || buildWrongNotebookExport({});
    const lines = [
      "错题本导出",
      `导出时间：${data.exportedAt || ""}`,
      `来源：${data.source || "未记录"}`,
      `范围：${data.activeChapter || "全部"}`,
      `章节数：${data.summary ? data.summary.chapterCount : 0}`,
      `题目数：${data.summary ? data.summary.questionCount : 0}`,
      "",
    ];

    (data.chapters || []).forEach((chapterBlock) => {
      lines.push(`【${chapterBlock.chapter}】`);
      (chapterBlock.questions || []).forEach((question) => {
        lines.push(`${question.number || ""}. ${question.question || ""}`.trim());
        Object.keys(question.options || {}).sort().forEach((letter) => {
          lines.push(`${letter}. ${question.options[letter]}`);
        });
        lines.push(`正确答案：${normalizeAnswer(question.answer).join("") || "未记录"}`);
        lines.push(`上次选择：${normalizeAnswer(question.lastChoice).join("") || "未记录"}`);
        if (question.wrongAt) lines.push(`错题时间：${question.wrongAt}`);
        lines.push("");
      });
    });

    if (!(data.summary && data.summary.questionCount)) {
      lines.push("当前没有错题。");
    }

    return lines.join("\n");
  }

  return {
    LETTERS,
    parseQuestionBank,
    isCorrectAnswer,
    addWrongQuestion,
    removeWrongQuestion,
    buildWrongNotebookExport,
    formatWrongNotebookTxt,
    normalizeAnswer,
  };
});
