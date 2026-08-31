"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";

export default function JoinPage() {
  return (
    <Suspense>
      <JoinForm />
    </Suspense>
  );
}

function JoinForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [code, setCode] = useState("");
  const [nickname, setNickname] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const nickRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const fromQr = searchParams.get("code") ?? "";
    if (/^\d{6,7}$/.test(fromQr)) {
      setCode(fromQr);
      nickRef.current?.focus();
    }
  }, [searchParams]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const clean = code.trim();
    if (!/^\d{6,7}$/.test(clean)) {
      setError("رقم الجلسة من 6 إلى 7 أرقام");
      return;
    }
    if (!nickname.trim()) {
      setError("اكتب اسمك المستعار");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/session/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: clean, nickname: nickname.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError("لا توجد جلسة مفتوحة بهذا الرقم");
        setBusy(false);
        return;
      }
      sessionStorage.setItem(`participant:${clean}`, data.participantId);
      router.push(`/session/${clean}`);
    } catch {
      setError("تعذّر الاتصال، حاول مجددًا");
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen px-6 py-12 max-w-md mx-auto flex flex-col">
      <p className="text-xs uppercase tracking-[0.35em] text-[color:var(--gold-deep)]" dir="ltr">
        DAR MAKKAH
      </p>
      <h1 className="mt-4 text-3xl font-bold text-[color:var(--foreground)]">انضمام إلى جلسة</h1>
      <p className="mt-3 text-[color:var(--body-ink)]">ادخل رقم الجلسة واسمك المستعار.</p>

      <form onSubmit={onSubmit} className="mt-10 flex flex-col gap-6">
        <label className="flex flex-col gap-2">
          <span className="text-sm text-[color:var(--muted-ink)]">رقم الجلسة</span>
          <input
            dir="ltr"
            inputMode="numeric"
            pattern="\d*"
            maxLength={7}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            placeholder="123456"
            className="text-3xl tracking-[0.3em] text-center py-4 bg-[color:var(--background)] border-2 border-[color:var(--gold)] rounded-sm outline-none focus:border-[color:var(--lapis)]"
          />
        </label>
        <label className="flex flex-col gap-2">
          <span className="text-sm text-[color:var(--muted-ink)]">الاسم المستعار</span>
          <input
            ref={nickRef}
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="مثال: عبد الله"
            maxLength={24}
            className="text-xl py-3 px-4 bg-[color:var(--background)] border-2 border-[color:var(--rule)] rounded-sm outline-none focus:border-[color:var(--lapis)]"
          />
        </label>

        {error && <p className="text-[color:var(--red)]">{error}</p>}

        <button
          type="submit"
          disabled={busy}
          className="bg-[color:var(--foreground)] text-[color:var(--background)] py-4 text-lg font-semibold rounded-sm disabled:opacity-50"
        >
          {busy ? "جارٍ الدخول…" : "ادخل"}
        </button>
      </form>
    </main>
  );
}
