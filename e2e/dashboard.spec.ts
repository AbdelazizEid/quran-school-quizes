import { expect, test } from "@playwright/test";

async function expectNoHorizontalOverflow(page: import("@playwright/test").Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth
  );
  expect(overflow, `horizontal overflow ${overflow}px`).toBeLessThanOrEqual(0);
}

test("quiz CRUD: create quiz with questions via dashboard", async ({ page }) => {
  await page.goto("/quizzes");
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("heading", { name: "مكتبة الأسئلة" })).toBeVisible();

  await page.getByRole("link", { name: "اختبار جديد" }).click();
  // dev cold-compile of the editor route can exceed the 5s default
  await expect(page.getByRole("heading", { name: "اختبار جديد" })).toBeVisible({ timeout: 15000 });
  await page.waitForLoadState("networkidle");

  const title = `اختبار ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  await page.getByPlaceholder("عنوان الاختبار — مثال: سورة الفاتحة").fill(title);
  await page.getByPlaceholder("نص السؤال").fill("كم عدد سور القرآن؟");
  await page.getByPlaceholder("الخيار 1").fill("114");
  await page.getByPlaceholder("الخيار 2").fill("113");
  await page.getByRole("button", { name: "حفظ" }).click();

  await expect(page.getByRole("heading", { name: "مكتبة الأسئلة" })).toBeVisible();
  await expect(page.getByRole("link", { name: title })).toBeVisible();

  await expectNoHorizontalOverflow(page);
});

test("quiz copy creates a detached duplicate", async ({ page }) => {
  await page.goto("/quizzes");
  const first = page.locator("li", { has: page.getByRole("button", { name: "نسخ" }) }).first();
  await first.getByRole("button", { name: "نسخ" }).click();
  await expect(page.getByText("(نسخة)").first()).toBeVisible();
});

test("landing renders RTL with no overflow, header user and teacher stats", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading").first()).toContainText(/اختبارات قرآنية|أسئلة القرآن/);
  // dev mode: the signed-out visitor is the dev teacher
  await expect(page.getByText("مدرّس تجريبي").first()).toBeVisible();
  await expect(page.getByLabel("الإحصائيات")).toBeVisible();
  await expect(page.getByText("مجموعات الأسئلة")).toBeVisible();
  await expect(page.getByText("جلسات المسابقات")).toBeVisible();
  expect(await page.getAttribute("html", "dir")).toBe("rtl");
  await expectNoHorizontalOverflow(page);
});

test("header shows on library pages and hides on live game screens", async ({ page }) => {
  await page.goto("/quizzes");
  await expect(page.getByRole("banner").getByText("دار مكة")).toBeVisible();

  // immersive game screens have no header — verify via a live session page
  const session = await page.evaluate(async () => {
    const q = await fetch("/api/quizzes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: `header-${Date.now()}`,
        questions: [
          {
            kind: "MCQ",
            text: "كم عدد سور القرآن؟",
            options: [
              { text: "114", isCorrect: true },
              { text: "113", isCorrect: false },
            ],
          },
        ],
      }),
    }).then((r) => r.json());
    return fetch(`/api/quizzes/${q.quiz.id}/session`, { method: "POST" }).then((r) => r.json());
  });
  await page.goto(`/session/${session.session.joinCode}`);
  await expect(page.getByRole("banner")).toHaveCount(0);
});

test("join page validates code and nickname", async ({ page }) => {
  await page.goto("/join");
  // click before hydration submits the form natively and loses the validation
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "ادخل" }).click();
  await expect(page.getByText("رقم الجلسة من 6 إلى 7 أرقام")).toBeVisible();

  await page.getByPlaceholder("123456").fill("12");
  await page.getByRole("button", { name: "ادخل" }).click();
  await expect(page.getByText("رقم الجلسة من 6 إلى 7 أرقام")).toBeVisible();

  await page.getByPlaceholder("123456").fill("999999");
  await page.getByPlaceholder("مثال: عبد الله").fill("طالب");
  await page.getByRole("button", { name: "ادخل" }).click();
  await expect(page.getByText("لا توجد جلسة مفتوحة بهذا الرقم")).toBeVisible();
  await expectNoHorizontalOverflow(page);
});
