import { prisma } from "@/lib/prisma";

export type TeacherStats = {
  quizzes: number;
  competitions: number;
  studentsReached: number;
  avgScore: number;
  recent: {
    id: string;
    quizTitle: string;
    phase: string;
    participantCount: number;
    top: { nickname: string; totalScore: number } | null;
  }[];
};

export type StudentStats = {
  competitions: number;
  bestRank: number | null;
  totalPoints: number;
  practiceAnswered: number;
  practiceCorrectRate: number | null;
};

export async function teacherStats(teacherId: string): Promise<TeacherStats> {
  const [quizzes, competitions, participants, recentSessions] = await Promise.all([
    prisma.quiz.count({ where: { authorId: teacherId } }),
    prisma.session.count({ where: { hostId: teacherId } }),
    prisma.sessionParticipant.findMany({
      where: { session: { hostId: teacherId } },
      select: { nickname: true, totalScore: true },
    }),
    prisma.session.findMany({
      where: { hostId: teacherId },
      orderBy: { createdAt: "desc" },
      take: 3,
      include: {
        quiz: { select: { title: true } },
        participants: { orderBy: { totalScore: "desc" }, take: 1 },
        _count: { select: { participants: true } },
      },
    }),
  ]);

  const distinctNicknames = new Set(participants.map((p) => p.nickname));
  const avgScore = participants.length
    ? Math.round(participants.reduce((s, p) => s + p.totalScore, 0) / participants.length)
    : 0;

  return {
    quizzes,
    competitions,
    studentsReached: distinctNicknames.size,
    avgScore,
    recent: recentSessions.map((s) => ({
      id: s.id,
      quizTitle: s.quiz.title,
      phase: s.phase,
      participantCount: s._count.participants,
      top: s.participants[0]
        ? { nickname: s.participants[0].nickname, totalScore: s.participants[0].totalScore }
        : null,
    })),
  };
}

export async function studentStats(studentId: string): Promise<StudentStats> {
  const participations = await prisma.sessionParticipant.findMany({
    where: { studentId },
    select: { sessionId: true, totalScore: true },
  });

  let bestRank: number | null = null;
  if (participations.length) {
    const sessionIds = participations.map((p) => p.sessionId);
    const all = await prisma.sessionParticipant.findMany({
      where: { sessionId: { in: sessionIds } },
      select: { sessionId: true, totalScore: true },
      orderBy: { totalScore: "desc" },
    });
    const bySession = new Map<string, number[]>();
    for (const p of all) {
      const list = bySession.get(p.sessionId) ?? [];
      list.push(p.totalScore);
      bySession.set(p.sessionId, list);
    }
    for (const mine of participations) {
      const scores = bySession.get(mine.sessionId) ?? [];
      const rank = scores.findIndex((s) => s === mine.totalScore) + 1;
      if (rank > 0 && (bestRank === null || rank < bestRank)) bestRank = rank;
    }
  }

  const practice = await prisma.practiceAnswer.findMany({
    where: { studentId, isCorrect: { not: null } },
    select: { isCorrect: true },
  });

  return {
    competitions: participations.length,
    bestRank,
    totalPoints: participations.reduce((s, p) => s + p.totalScore, 0),
    practiceAnswered: practice.length,
    practiceCorrectRate: practice.length
      ? Math.round((practice.filter((a) => a.isCorrect).length / practice.length) * 100)
      : null,
  };
}
