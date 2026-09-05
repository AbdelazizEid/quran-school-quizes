export type SessionState = {
  phase: "LOBBY" | "QUESTION" | "ANSWER_REVIEW" | "LEADERBOARD" | "CLOSED";
  phaseStartedAt: number;
  questionIndex: number;
  questionCount: number;
  quizTitle: string;
  joinCode: string;
  question: {
    id: string;
    kind: "MCQ" | "TRUE_FALSE" | "INPUT";
    text: string;
    timeLimitSec: number;
    options: { id: string; text: string; isCorrect?: boolean }[];
  } | null;
  answers?: { counts: Record<string, number>; total: number; answered?: string[] };
  roster?: { id: string; nickname: string; totalScore: number; streak?: number }[];
  leaderboard?: { id: string; nickname: string; totalScore: number; streak?: number }[];
  results?: Record<string, { correct: boolean; points: number; bonus: number; streak: number }>;
  online?: string[];
};
