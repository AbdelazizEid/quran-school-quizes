import { expect, test } from "@playwright/test";

// live-socket flow occasionally flakes under full-suite load; one retry, genuine failures still fail
test.describe.configure({ retries: 1 });

test("full live competition: host starts, student joins by code and answers", async ({ browser }) => {
  const teacher = await browser.newContext();
  const page = await teacher.newPage();

  await page.goto("/quizzes");
  await page.waitForLoadState("networkidle");
  await page.getByRole("link", { name: "اختبار جديد" }).click();
  const quizTitle = `مسابقة ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  await expect(page.getByRole("heading", { name: "اختبار جديد" })).toBeVisible({ timeout: 15000 });
  // click before hydration would lose the حفظ handler on the cold editor compile
  await page.waitForLoadState("networkidle");
  await page.getByPlaceholder("عنوان الاختبار — مثال: سورة الفاتحة").fill(quizTitle);
  await page.getByPlaceholder("نص السؤال").fill("سورة الفاتحة عدد آياتها؟");
  await page.getByPlaceholder("الخيار 1").fill("سبع");
  await page.getByPlaceholder("الخيار 2").fill("خمس");
  await page.getByRole("button", { name: "حفظ" }).click();
  await expect(page.getByRole("heading", { name: "مكتبة الأسئلة" })).toBeVisible();

  const quizRow = page.locator("li", { hasText: quizTitle });
  await expect(quizRow).toBeVisible({ timeout: 10000 });
  await quizRow.getByRole("button", { name: "ابدأ مسابقة" }).click();

  await expect(page.getByText("رقم الجلسة")).toBeVisible({ timeout: 30000 });
  const joinCode = ((await page.locator("p.text-4xl").first().textContent()) ?? "").trim();
  expect(joinCode).toMatch(/^\d{6,7}$/);

  await expect(page.locator("canvas.qr")).toBeVisible();
  const qrPayload = await page.evaluate(() => {
    const el = document.querySelector("canvas.qr") as HTMLCanvasElement | null;
    return el?.dataset.qrPayload ?? "";
  });
  expect(qrPayload).toContain(joinCode);

  const studentCtx = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const student = await studentCtx.newPage();

  await student.goto(`/join?code=${joinCode}`);
  await expect(student.getByPlaceholder("123456")).toHaveValue(joinCode);
  await student.getByPlaceholder("مثال: عبد الله").fill("خالد");
  await student.getByRole("button", { name: "ادخل" }).click();

  await expect(student.getByText("في انتظار بدء الجلسة")).toBeVisible({ timeout: 15000 });
  await expect(student.getByText("خالد").first()).toBeVisible();
  await expect(page.getByText("خالد").first()).toBeVisible({ timeout: 15000 });

  await page.getByRole("button", { name: "ابدأ أول سؤال" }).click();

  await expect(student.getByText("سؤال 1 من 1")).toBeVisible({ timeout: 15000 });
  await student.getByRole("button", { name: "سبع" }).click();
  await expect(student.getByText("تم إرسال إجابتك")).toBeVisible();

  await page.getByRole("button", { name: "اكشف الإجابة" }).click();
  await expect(student.getByText("إجابة صحيحة!")).toBeVisible({ timeout: 15000 });

  await page.getByRole("button", { name: "اعرض لوحة النتائج" }).click();
  await expect(student.getByText("لوحة النتائج")).toBeVisible({ timeout: 15000 });
  await expect(student.getByText("خالد").first()).toBeVisible();
  await expect(page.getByLabel("منصة الفائزين")).toBeVisible({ timeout: 15000 });
  await expect(student.getByLabel("منصة الفائزين")).toBeVisible({ timeout: 15000 });

  const overflow = await student.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth
  );
  expect(overflow).toBeLessThanOrEqual(0);

  await page.getByRole("button", { name: "إنهاء وعرض المنصة" }).click();
  await expect(student.getByText("انتهت الجلسة، شكرًا لمشاركتك.")).toBeVisible({ timeout: 15000 });
  await expect(page.getByLabel("منصة الفائزين")).toBeVisible();

  await page.goto("/results");
  await expect(page.getByRole("heading", { name: "نتائج الجلسات" })).toBeVisible();
  const row = page.locator("a", { hasText: quizTitle });
  await expect(row).toBeVisible({ timeout: 10000 });
  await row.click();
  await expect(page.getByText("الترتيب النهائي")).toBeVisible({ timeout: 10000 });
  await expect(page.getByText("خالد").first()).toBeVisible();

  await studentCtx.close();
  await teacher.close();
});
