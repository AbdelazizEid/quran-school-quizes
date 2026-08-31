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
    <main className="min-h-screen px-5 md:px-14 py-10 md:py-14 max-w-5xl w-full mx-auto">
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
    { label: "جلسات المنافسة", value: stats.competitions },
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
          className="text-center bg-[color:var(--foreground)] text-[color:var(--background)] px-8 py-3.5 text-lg font-semibold rounded-sm hover:bg-[#1f150a]"
        >
          ابدأ منافسة
        </Link>
        <Link
          href="/results"
          className="text-center border border-[color:var(--lapis)] px-8 py-3.5 text-lg font-semibold rounded-sm hover:bg-[color:var(--wash)]"
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
      label: "نسبة الصواب في الممارسة",
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
          className="text-center bg-[color:var(--foreground)] text-[color:var(--background)] px-8 py-3.5 text-lg font-semibold rounded-sm hover:bg-[#1f150a]"
        >
          دخول جلسة
        </Link>
        <Link
          href="/quizzes"
          className="text-center border border-[color:var(--lapis)] px-8 py-3.5 text-lg font-semibold rounded-sm hover:bg-[color:var(--wash)]"
        >
          ممارسة ذاتية
        </Link>
      </section>
    </>
  );
}

function GuestHero() {
  return (
    <div className="grid md:grid-cols-[1fr_auto] gap-10 items-start">
      <div>
        <p className="text-xs uppercase tracking-[0.35em] text-[color:var(--gold-deep)]" dir="ltr">
          DAR MAKKAH
        </p>
        <h1 className="mt-5 text-4xl md:text-5xl font-bold leading-snug text-[color:var(--foreground)]">
          أسئلة القرآن
          <br />
          لمنافسة صفّية مباشرة
        </h1>
        <p className="mt-5 text-lg leading-8 text-[color:var(--body-ink)]">
          أنشئ المعلّم الاختبار، ويدخل الطالب برقم الجلسة واسم مستعار — بلا حساب.
        </p>
        <div className="mt-10 flex flex-col sm:flex-row gap-4">
          <Link
            href="/join"
            className="text-center bg-[color:var(--foreground)] text-[color:var(--background)] px-9 py-4 text-lg font-semibold rounded-sm hover:bg-[#1f150a]"
          >
            ابدأ جلسة
          </Link>
          <Link
            href="/quizzes"
            className="text-center border border-[color:var(--lapis)] text-[color:var(--foreground)] px-9 py-4 text-lg font-semibold rounded-sm hover:bg-[color:var(--wash)]"
          >
            مكتبة الأسئلة
          </Link>
        </div>
        <p className="mt-12 text-sm leading-7 text-[color:var(--muted-ink)]">
          للممارسة الذاتية: حساب للطالب يحفظ تقدّمه، وتصحيح يدوي لأسئلة الإجابة الحرة.
        </p>
      </div>

      <div className="octa p-8 w-full max-w-xs">
        <p className="text-xs tracking-[0.25em] uppercase text-[color:var(--red)]" dir="ltr">
          JOIN CODE
        </p>
        <p className="mt-2 text-5xl font-bold tracking-[0.1em] text-[color:var(--foreground)]" dir="ltr">
          7<span className="text-[color:var(--gold)]">4</span>1
          <span className="text-[color:var(--gold)]">9</span>2
          <span className="text-[color:var(--gold)]">8</span>
        </p>
        <p className="mt-2 text-sm text-[color:var(--muted-ink)]">
          ادخل الرقم ثم اختر اسمك المستعار
        </p>
      </div>
    </div>
  );
}
