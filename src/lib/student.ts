import { prisma } from "@/lib/prisma";
import { clerkEnabled } from "@/lib/teacher";

/** Resolve the signed-in student, or the dev student when Clerk is off. */
export async function getStudent(): Promise<{ id: string; name: string } | null> {
  if (!clerkEnabled()) {
    const dev = await prisma.student.upsert({
      where: { clerkId: "dev-student" },
      update: {},
      create: { clerkId: "dev-student", name: "طالب تجريبي" },
    });
    return { id: dev.id, name: dev.name };
  }
  const { auth } = await import("@clerk/nextjs/server");
  const { userId } = auth();
  if (!userId) return null;
  const student = await prisma.student.upsert({
    where: { clerkId: userId },
    update: {},
    create: { clerkId: userId, name: "طالب" },
  });
  return { id: student.id, name: student.name };
}
