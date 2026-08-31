"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const navByRole: Record<string, { href: string; label: string }[]> = {
  teacher: [
    { href: "/", label: "الرئيسية" },
    { href: "/quizzes", label: "مكتبة الأسئلة" },
    { href: "/results", label: "النتائج" },
  ],
  student: [
    { href: "/", label: "الرئيسية" },
    { href: "/join", label: "دخول جلسة" },
  ],
  guest: [
    { href: "/", label: "الرئيسية" },
    { href: "/join", label: "دخول جلسة" },
    { href: "/quizzes", label: "مكتبة الأسئلة" },
  ],
};

const roleLabels: Record<string, string> = { teacher: "معلّم", student: "طالب" };

export default function SiteHeader() {
  const [me, setMe] = useState<{ role: string; name?: string } | null>(null);
  const pathname = usePathname();

  // live game screens are immersive — no header there
  const immersive =
    pathname?.startsWith("/host/") || pathname?.startsWith("/session/") || false;

  useEffect(() => {
    fetch("/api/me")
      .then((r) => r.json())
      .then((d) => setMe({ role: d.role ?? "guest", name: d.name }))
      .catch(() => setMe({ role: "guest" }));
  }, []);

  if (immersive) return null;

  const role = me?.role ?? "teacher"; // header renders before /api/me answers
  const links = navByRole[role] ?? navByRole.guest;

  return (
    <header className="border-b border-[color:var(--rule)] bg-[color:var(--background)]">
      <div className="max-w-5xl mx-auto px-5 md:px-6 py-3 flex flex-wrap items-center gap-x-8 gap-y-3">
        <Link href="/" className="flex items-baseline gap-3">
          <span className="text-sm font-bold text-[color:var(--gold-deep)]">دار مكة</span>
          <span
            className="text-[10px] uppercase tracking-[0.3em] text-[color:var(--muted-ink)]"
            dir="ltr"
          >
            DAR MAKKAH
          </span>
        </Link>

        <nav aria-label="التنقل الرئيسي" className="flex items-center gap-5 text-sm">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="text-[color:var(--body-ink)] hover:text-[color:var(--lapis)] transition-colors"
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="ms-auto">
          {me === null ? null : me.role === "guest" ? (
            <Link
              href="/join"
              className="border border-[color:var(--lapis)] text-[color:var(--lapis)] px-4 py-1.5 text-sm font-semibold rounded-sm hover:bg-[color:var(--wash)] transition-colors"
            >
              دخول الجلسة
            </Link>
          ) : (
            <span className="flex items-center gap-2.5" aria-label={`${me.name} — ${roleLabels[me.role]}`}>
              <span className="w-8 h-8 rounded-full bg-[color:var(--lapis)] text-[color:var(--background)] flex items-center justify-center text-sm font-bold">
                {me.name?.[0] ?? "؟"}
              </span>
              <span className="leading-tight">
                <span className="block text-sm font-semibold">{me.name}</span>
                <span className="block text-xs text-[color:var(--muted-ink)]">
                  {roleLabels[me.role]}
                </span>
              </span>
            </span>
          )}
        </div>
      </div>
    </header>
  );
}
