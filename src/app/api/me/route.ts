import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { clerkEnabled, getTeacher } from "@/lib/teacher";
import { teacherStats, studentStats } from "@/lib/stats";

export async function GET() {
  if (!clerkEnabled()) {
    const teacher = await getTeacher();
    if (!teacher) return NextResponse.json({ role: "guest" });
    return NextResponse.json({
      role: "teacher",
      name: teacher.name,
      stats: await teacherStats(teacher.id),
    });
  }

  const { auth } = await import("@clerk/nextjs/server");
  const { userId } = auth();
  if (!userId) return NextResponse.json({ role: "guest" });

  const student = await prisma.student.findUnique({ where: { clerkId: userId } });
  if (student) {
    return NextResponse.json({
      role: "student",
      name: student.name,
      stats: await studentStats(student.id),
    });
  }

  const teacher = await getTeacher();
  if (!teacher) return NextResponse.json({ role: "guest" });
  return NextResponse.json({
    role: "teacher",
    name: teacher.name,
    stats: await teacherStats(teacher.id),
  });
}
