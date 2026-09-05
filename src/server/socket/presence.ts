// Who is currently connected to a session, per participant. Students may
// open several tabs; a participant counts as present until every socket
// for them has left. In-memory by design: presence resets with the process.
export function createPresence() {
  const counts = new Map<string, Map<string, number>>();

  function mapFor(sessionId: string) {
    let m = counts.get(sessionId);
    if (!m) {
      m = new Map();
      counts.set(sessionId, m);
    }
    return m;
  }

  return {
    /** registers a socket; true when the participant just became present */
    arrive(sessionId: string, participantId: string): boolean {
      const m = mapFor(sessionId);
      const next = (m.get(participantId) ?? 0) + 1;
      m.set(participantId, next);
      return next === 1;
    },
    /** unregisters a socket; true when the participant just left entirely */
    leave(sessionId: string, participantId: string): boolean {
      const m = counts.get(sessionId);
      if (!m) return false;
      const next = (m.get(participantId) ?? 0) - 1;
      if (next > 0) {
        m.set(participantId, next);
        return false;
      }
      m.delete(participantId);
      if (m.size === 0) counts.delete(sessionId);
      return true;
    },
    online(sessionId: string): string[] {
      return [...(counts.get(sessionId)?.keys() ?? [])];
    },
  };
}
