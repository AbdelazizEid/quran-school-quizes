"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import StatPlates, { type StatItem } from "@/components/StatPlates";
import type { StudentStats, TeacherStats } from "@/lib/stats";

type Me =
  | { role: "teacher"; name: string; stats: TeacherStats }
  | { role: "student"; name: string; stats: StudentStats }
  | { role: "guest" };

const phaseLabels: Record<string, string> = {
  LOBBY: "الردهة",
  QUESTION: "سؤال جارٍ",
  ANSWER_REVIEW: "سؤال جارٍ",
  LEADERBOARD: "سؤال جارٍ",
  CLOSED: "انتهت",
};

export default function Home() {
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    fetch("/api/me")
      .then((r) => r.json())
      .then((d) => setMe(d))
      .catch(() => setMe({ role: "guest" }));
  }, []);

  return (
    <main className="min-h-screen w-full max-w-5xl mx-auto px-5 py-10 text-start md:px-14 md:py-14">
      {me === null ? null : me.role === "guest" ? (
        <GuestHero />
      ) : (
        <>
          <p className="text-xs uppercase tracking-[0.35em] text-[color:var(--gold-deep)]" dir="ltr">
            DAR MAKKAH
          </p>
          <h1 className="mt-4 text-3xl md:text-4xl font-bold leading-snug">
            أسئلة القرآن
            <span className="block mt-2 text-xl md:text-2xl font-semibold text-[color:var(--muted-ink)]">
              مرحبًا، {me.name}
            </span>
          </h1>

          {me.role === "teacher" ? <TeacherDashboard stats={me.stats} /> : <StudentDashboard stats={me.stats} />}
        </>
      )}
    </main>
  );
}

function TeacherDashboard({ stats }: { stats: TeacherStats }) {
  const items: StatItem[] = [
    { label: "مجموعات الأسئلة", value: stats.quizzes },
    { label: "جلسات المسابقات", value: stats.competitions },
    { label: "الطلاب المشاركون", value: stats.studentsReached },
    { label: "متوسط النتائج", value: stats.avgScore, tone: "gold" },
  ];

  return (
    <>
      <section className="mt-8" aria-label="إحصائيات المعلّم">
        <StatPlates items={items} />
      </section>

      <section className="mt-10 flex flex-col sm:flex-row gap-4">
        <Link
          href="/quizzes"
          className="text-center bg-[color:var(--foreground)] text-[color:var(--background)] px-8 py-3.5 text-lg font-semibold rounded-xl hover:bg-[#1f150a] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--gold)]"
        >
          ابدأ مسابقة
        </Link>
        <Link
          href="/results"
          className="text-center border border-[color:var(--lapis)] px-8 py-3.5 text-lg font-semibold rounded-xl hover:bg-[color:var(--wash)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--gold)]"
        >
          عرض النتائج
        </Link>
      </section>

      {stats.recent.length > 0 && (
        <section className="mt-12" aria-label="آخر الجلسات">
          <h2 className="text-lg font-semibold">آخر الجلسات</h2>
          <ul className="mt-4 border-t border-[color:var(--rule)]">
            {stats.recent.map((s) => (
              <li key={s.id} className="border-b border-[color:var(--rule)]">
                <Link
                  href={`/results/${s.id}`}
                  className="flex items-center gap-4 py-4 px-2 hover:bg-[color:var(--wash)] transition-colors"
                >
                  <span className="font-semibold truncate">{s.quizTitle}</span>
                  <span className="text-sm text-[color:var(--muted-ink)]">
                    {phaseLabels[s.phase] ?? s.phase} · {s.participantCount} طالبًا
                  </span>
                  <span className="ms-auto text-sm text-[color:var(--muted-ink)] truncate">
                    {s.top ? (
                      <>
                        الفائز: <span className="font-semibold text-[color:var(--gold-deep)]">{s.top.nickname}</span>
                      </>
                    ) : (
                      "لا مشاركين بعد"
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function StudentDashboard({ stats }: { stats: StudentStats }) {
  const items: StatItem[] = [
    { label: "جلسات شاركت بها", value: stats.competitions },
    { label: "أفضل مركز", value: stats.bestRank, kind: "rank", tone: "gold" },
    { label: "مجموع نقاطي", value: stats.totalPoints },
    {
      label: "نسبة الصواب في الاختبار",
      value: stats.practiceCorrectRate,
      kind: "percent",
    },
  ];

  return (
    <>
      <section className="mt-8" aria-label="إحصائيات الطالب">
        <StatPlates items={items} />
      </section>

      <section className="mt-10 flex flex-col sm:flex-row gap-4">
        <Link
          href="/join"
          className="text-center bg-[color:var(--foreground)] text-[color:var(--background)] px-8 py-3.5 text-lg font-semibold rounded-xl hover:bg-[#1f150a] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--gold)]"
        >
          دخول جلسة
        </Link>
        <Link
          href="/quizzes"
          className="text-center border border-[color:var(--lapis)] px-8 py-3.5 text-lg font-semibold rounded-xl hover:bg-[color:var(--wash)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--gold)]"
        >
          اختبار ذاتي
        </Link>
      </section>
    </>
  );
}

const joinSteps = [
  {
    number: "١",
    title: "اختيار الاختبار",
    description: "يختار المعلّم الاختبار من المكتبة ويطلق المسابقة للصف.",
  },
  {
    number: "٢",
    title: "دخول الجلسة",
    description: "يستخدم الطالب رمز الجلسة أو QR، ثم يكتب اسمًا مستعارًا بلا حساب.",
  },
  {
    number: "٣",
    title: "عرض النتائج",
    description: "يجيب الطلاب عن الأسئلة، وتظهر لوحة الصدارة بعد كل سؤال.",
  },
];

function GuestHero() {
  return (
    <>
      <div className="grid md:grid-cols-[1fr_18rem] gap-12 items-start">
        <div>
          <div className="flex items-start gap-4">
            <h1 className="text-balance text-5xl md:text-6xl font-bold leading-[1.2] text-[color:var(--foreground)]">
              اختبارات قرآنية
              <br />
              للصف
            </h1>
            <span className="medallion mt-3 shrink-0" aria-hidden="true" />
          </div>
          <p className="font-body-serif mt-7 max-w-[34rem] text-lg md:text-xl leading-9 text-[color:var(--body-ink)]">
            أنشئ اختبارًا من مكتبة الأسئلة، أو انضم إلى مسابقة مباشرة باستخدام رمز الجلسة.
          </p>
        </div>

        <section
          className="border-s border-[color:var(--rule)] ps-6 md:ps-8"
          aria-label="ابدأ من هنا"
        >
          <h2 className="text-xl font-semibold">ابدأ من هنا</h2>
          <div className="mt-5">
            <div className="border-t border-[color:var(--rule)] py-5">
              <div className="flex items-baseline justify-between gap-4">
                <h3 className="text-lg font-semibold">دخول جلسة</h3>
                <span className="text-sm text-[color:var(--muted-ink)]">للطالب</span>
              </div>
              <p className="mt-2 text-sm leading-7 text-[color:var(--body-ink)]">
                أدخل رمز الجلسة الذي عرضه المعلّم وانضم باسم مستعار.
              </p>
              <Link
                href="/join"
                className="mt-4 inline-flex rounded-xl bg-[color:var(--foreground)] px-5 py-3 font-semibold text-[color:var(--background)] hover:bg-[#1f150a] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--gold)]"
              >
                دخول الجلسة
              </Link>
            </div>
            <div className="border-t border-[color:var(--rule)] py-5">
              <div className="flex items-baseline justify-between gap-4">
                <h3 className="text-lg font-semibold">إنشاء اختبار</h3>
                <span className="text-sm text-[color:var(--muted-ink)]">للمعلّم</span>
              </div>
              <p className="mt-2 text-sm leading-7 text-[color:var(--body-ink)]">
                أنشئ الأسئلة ثم أطلق مسابقة أو اختبارًا ذاتيًا.
              </p>
              <Link
                href="/quizzes"
                className="mt-4 inline-flex rounded-xl border border-[color:var(--lapis)] px-5 py-3 font-semibold text-[color:var(--foreground)] hover:bg-[color:var(--wash)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--gold)]"
              >
                فتح المكتبة
              </Link>
            </div>
          </div>
        </section>
      </div>

      <section
        className="mt-16 border-t border-[color:var(--rule)] pt-10"
        aria-label="المسابقة والاختبار"
      >
        <h2 className="text-2xl font-semibold">المسابقة والاختبار</h2>
        <div className="mt-8 md:grid md:grid-cols-2">
          <article className="md:pe-12">
            <h3 className="text-xl font-semibold">مسابقة مباشرة</h3>
            <p className="mt-3 leading-8 text-[color:var(--body-ink)]">
              للحصة الدراسية. ينضم الطلاب برمز الجلسة أو QR، ويجيبون خلال الوقت المحدد. تُحسب
              النقاط حسب صحة الإجابة وسرعة الرد.
            </p>
          </article>
          <article className="mt-10 border-t border-[color:var(--rule)] pt-10 md:mt-0 md:border-t-0 md:border-s md:ps-12">
            <h3 className="text-xl font-semibold">اختبار ذاتي</h3>
            <p className="mt-3 leading-8 text-[color:var(--body-ink)]">
              للطالب الذي يريد الإجابة في وقته. تُحفظ الإجابات، ويصحّح المعلّم إجابات الأسئلة الحرة
              يدويًا.
            </p>
          </article>
        </div>
      </section>

      <section
        className="mt-16 border-t border-[color:var(--rule)] pt-10"
        aria-label="كيف تعمل المسابقة"
      >
        <h2 className="text-2xl font-semibold">كيف تعمل المسابقة؟</h2>
        <ol className="mt-8 grid gap-6 md:grid-cols-3">
          {joinSteps.map((step) => (
            <li key={step.number} className="border-s border-[color:var(--rule)] ps-5">
              <span className="text-lg font-bold text-[color:var(--gold-deep)]">{step.number}</span>
              <h3 className="mt-2 text-lg font-semibold">{step.title}</h3>
              <p className="mt-2 text-sm leading-7 text-[color:var(--body-ink)]">{step.description}</p>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
