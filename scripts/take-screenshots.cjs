const { chromium } = require("@playwright/test");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const BASE = "http://127.0.0.1:3000";
const OUT = path.join(__dirname, "..", "screenshots");

async function api(p, method = "GET", body) {
  const res = await fetch(`${BASE}${p}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`${p} -> ${res.status}: ${JSON.stringify(data)}`);
  return data;
}

function connectSocket(query) {
  const io = require("socket.io-client");
  return io(`${BASE}/session`, { path: "/socket", transports: ["websocket"], query });
}

function waitPhase(sock, phase, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout ${phase}`)), timeout);
    const h = (s) => {
      if (s?.phase === phase) {
        clearTimeout(t);
        sock.off("state", h);
        resolve(s);
      }
    };
    sock.on("state", h);
  });
}

const viewports = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844 },
};

async function shoot(page, name) {
  await page.waitForTimeout(700);
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log("saved", path.basename(file));
}

async function openAndShoot(browser, url, name, opts = {}) {
  if (process.env.SKIP_TO && name < process.env.SKIP_TO) return;
  for (const [label, vp] of Object.entries(viewports)) {
    const ctx = await browser.newContext({ viewport: vp, locale: "ar" });
    if (opts.initArg !== undefined)
      await ctx.addInitScript(
        (d) => sessionStorage.setItem(`participant:${d.code}`, d.pid),
        opts.initArg
      );
    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: "load", timeout: 60000 });
    if (opts.after) await opts.after(page, label);
    await shoot(page, `${name}-${label}`);
    await ctx.close();
  }
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });

  // ---------- seed data ----------
  const { quiz } = await api("/api/quizzes", "POST", {
    title: "مسابقة سورة الفاتحة",
    description: "أسئلة على سورة الفاتحة — مبطئة ومكية وآياتها",
    questions: [
      { kind: "MCQ", text: "كم عدد آيات سورة الفاتحة؟", options: [
        { text: "سبع آيات", isCorrect: true },
        { text: "خمس آيات", isCorrect: false },
        { text: "عشر آيات", isCorrect: false },
      ]},
      { kind: "TRUE_FALSE", text: "سورة الفاتحة مكية.", options: [{ text: "صح", isCorrect: true }] },
    ],
  });
  await api(`/api/quizzes/${quiz.id}/copy`, "POST");
  const { session } = await api(`/api/quizzes/${quiz.id}/session`, "POST");

  // three students join the lobby
  const joinRes = [];
  for (const nick of ["خالد", "أحمد", "مريم"]) {
    joinRes.push(await api("/api/session/join", "POST", { code: session.joinCode, nickname: nick }));
  }

  const host = connectSocket({ role: "host", sessionId: session.id });
  await waitPhase(host, "LOBBY");

  const students = joinRes.map((r) => connectSocket({ role: "student" }));
  const joined = students.map((s, i) =>
    new Promise((res) => s.emit("join", { code: session.joinCode, participantId: joinRes[i].participantId }, res))
  );
  await Promise.all(joined);

  const browser = await chromium.launch();

  // ---------- static pages ----------
  await openAndShoot(browser, `${BASE}/`, "01-landing");
  await openAndShoot(browser, `${BASE}/join?code=${session.joinCode}`, "02-join-qr-prefilled");
  await openAndShoot(browser, `${BASE}/quizzes`, "03-quizzes-dashboard");
  await openAndShoot(browser, `${BASE}/quizzes/new`, "04-quiz-editor-new");
  await openAndShoot(browser, `${BASE}/quizzes/${quiz.id}`, "05-quiz-editor-existing");
  await openAndShoot(browser, `${BASE}/practice/${quiz.id}`, "06-practice", {
    after: async (page) => {
      await page.getByPlaceholder("اكتب إجابتك").first().waitFor({ timeout: 8000 }).catch(() => {});
    },
  });
  await openAndShoot(browser, `${BASE}/results`, "07-results-list");

  // ---------- host lobby with QR ----------
  await openAndShoot(browser, `${BASE}/host/${session.id}`, "08-host-lobby-qr", {
    after: async (page) => {
      await page.getByText("رقم الجلسة").waitFor({ timeout: 15000 });
    },
  });

  // ---------- student screens across phases ----------
  const studentInit = {
    code: session.joinCode,
    pid: joinRes[0].participantId,
  };
  const studentUrl = `${BASE}/session/${session.joinCode}`;

  await openAndShoot(browser, studentUrl, "09-student-lobby", {
    initArg: studentInit,
    after: async (page) => {
      await page.getByText("في انتظار بدء الجلسة").waitFor({ timeout: 15000 });
    },
  });

  // start question 1
  host.emit("start");
  await waitPhase(host, "QUESTION");
  await openAndShoot(browser, studentUrl, "10-student-question", {
    initArg: studentInit,
    after: async (page) => {
      await page.getByText("سؤال 1 من 2").waitFor({ timeout: 15000 });
      await page.waitForTimeout(2500);
    },
  });
  await openAndShoot(browser, `${BASE}/host/${session.id}`, "11-host-question", {
    after: async (page) => {
      await page.getByText("سؤال 1 / 2").waitFor({ timeout: 15000 });
    },
  });

  // students answer (student 0 fast+correct for streak, others mixed)
  const q1 = await new Promise((res) => {
    const h = (s) => { if (s.phase === "QUESTION" && s.question) { host.off("state", h); res(s); } };
    host.on("state", h);
  });
  const correctId = quiz.questions[0].options.find((o) => o.isCorrect).id;
  await new Promise((r) => students[0].emit("answer", { optionId: correctId, timeMs: 3000 }, r));
  await new Promise((r) => students[1].emit("answer", { optionId: correctId, timeMs: 9000 }, r));
  await new Promise((r) => students[2].emit("answer", { optionId: q1.question.options[1].id, timeMs: 12000 }, r));

  host.emit("reveal");
  await waitPhase(host, "ANSWER_REVIEW");
  await openAndShoot(browser, `${studentUrl}?slow`, "12-student-reveal", {
    initArg: studentInit,
    after: async (page) => {
      try {
        await page.getByText(/إجابة صحيحة!|إجابة غير صحيحة|سلسلة/).first().waitFor({ timeout: 15000 });
      } catch {
        console.error("BODY:", (await page.evaluate(() => document.body.innerText)).replace(/\n+/g, " | "));
        throw new Error("result card missing");
      }
    },
  });
  await openAndShoot(browser, `${BASE}/host/${session.id}?slow`, "13-host-reveal-distribution", {
    after: async (page) => {
      await page.getByText("التالي").or(page.getByText("اعرض لوحة النتائج")).first().waitFor({ timeout: 15000 });
    },
  });

  // scoreboard after question 1: top-3 rewrite + countdown
  host.emit("next");
  await waitPhase(host, "LEADERBOARD");
  await openAndShoot(browser, `${studentUrl}?slow`, "14-student-scoreboard", {
    initArg: studentInit,
    after: async (page) => {
      await page.getByLabel("أفضل ثلاثة").waitFor({ timeout: 15000 });
      await page.waitForTimeout(1500);
    },
  });
  await openAndShoot(browser, `${BASE}/host/${session.id}?slow`, "15-host-scoreboard", {
    after: async (page) => {
      await page.getByLabel("أفضل ثلاثة").waitFor({ timeout: 15000 });
      await page.waitForTimeout(1500);
    },
  });

  // question 2, everyone correct (streaks)
  host.emit("next");
  await waitPhase(host, "QUESTION");
  const sahihId = (await new Promise((res) => {
    const h = (s) => { if (s.question?.text?.includes("الفاتحة")) { host.off("state", h); res(s); } };
    host.on("state", h);
  })).question.options.find((o) => o.text === "صح").id;
  for (const s of students) {
    await new Promise((r) => s.emit("answer", { optionId: sahihId, timeMs: 2000 + Math.random() * 4000 }, r));
  }
  host.emit("reveal");
  await waitPhase(host, "ANSWER_REVIEW");
  host.emit("next");
  await waitPhase(host, "LEADERBOARD");

  await openAndShoot(browser, `${studentUrl}?slow`, "16-student-podium", {
    initArg: studentInit,
    after: async (page) => {
      await page.getByLabel("منصة الفائزين").waitFor({ timeout: 15000 });
    },
  });
  await openAndShoot(browser, `${BASE}/host/${session.id}?slow`, "17-host-podium", {
    after: async (page) => {
      await page.getByLabel("منصة الفائزين").waitFor({ timeout: 15000 });
    },
  });

  host.emit("next");
  await waitPhase(host, "CLOSED");

  await openAndShoot(browser, `${BASE}/results/${session.id}`, "19-results-detail", {
    after: async (page) => {
      await page.getByText("الترتيب النهائي").waitFor({ timeout: 15000 });
    },
  });
  await openAndShoot(browser, `${studentUrl}?slow`, "18-student-closed", {
    initArg: studentInit,
    after: async (page) => {
      await page.getByText("انتهت الجلسة، شكرًا لمشاركتك.").waitFor({ timeout: 15000 });
    },
  });

  host.close();
  for (const s of students) s.close();
  await browser.close();
  console.log("\nDONE:", fs.readdirSync(OUT).length, "screenshots in", OUT);
})().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
