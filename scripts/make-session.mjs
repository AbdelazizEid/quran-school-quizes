const BASE = "http://127.0.0.1:3000";
async function api(path, method = "GET", body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return data;
}
const quiz = await api("/api/quizzes", "POST", {
  title: `manual-${Date.now()}`,
  questions: [{ kind: "MCQ", text: "كم عدد سور القرآن؟", options: [
    { text: "114", isCorrect: true }, { text: "113", isCorrect: false }] }],
});
const { session } = await api(`/api/quizzes/${quiz.quiz.id}/session`, "POST");
console.log(JSON.stringify({ sessionId: session.id, joinCode: session.joinCode }));
