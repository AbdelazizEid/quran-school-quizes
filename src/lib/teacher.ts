import { prisma } from "@/lib/prisma";

const DEV_TEACHER_CLERK_ID = "dev-teacher";

export function clerkEnabled(): boolean {
  const key = process.env.CLERK_SECRET_KEY ?? "";
  return key.startsWith("sk_") && !key.includes("placeholder");
}

export async function getTeacher(): Promise<{ id: string; name: string } | null> {
  if (!clerkEnabled()) {
    const dev = await prisma.teacher.upsert({
      where: { clerkId: DEV_TEACHER_CLERK_ID },
      update: { name: "مدرّس تجريبي" },
      create: { clerkId: DEV_TEACHER_CLERK_ID, name: "مدرّس تجريبي" },
    });
    return { id: dev.id, name: dev.name };
  }
  const { auth } = await import("@clerk/nextjs/server");
  const { userId } = auth();
  if (!userId) return null;
  const teacher = await prisma.teacher.upsert({
    where: { clerkId: userId },
    update: {},
    create: { clerkId: userId, name: "مدرّس" },
  });
  return { id: teacher.id, name: teacher.name };
}
