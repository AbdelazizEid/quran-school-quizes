import assert from "node:assert/strict";
import test from "node:test";
import { createPresence } from "../src/server/socket/presence";

test("arrive/leave refcount: a participant is gone only after their last socket leaves", () => {
  const presence = createPresence();

  assert.equal(presence.arrive("s1", "p1"), true, "first socket arrives");
  assert.equal(presence.arrive("s1", "p1"), false, "second tab of same participant");
  assert.deepEqual(presence.online("s1"), ["p1"]);

  assert.equal(presence.leave("s1", "p1"), false, "one tab left, participant still present");
  assert.equal(presence.leave("s1", "p1"), true, "last tab left, participant gone");
  assert.deepEqual(presence.online("s1"), []);
});

test("sessions and participants are isolated", () => {
  const presence = createPresence();
  presence.arrive("s1", "p1");
  presence.arrive("s2", "p2");
  assert.deepEqual(presence.online("s1"), ["p1"]);
  assert.deepEqual(presence.online("s2"), ["p2"]);

  assert.equal(presence.leave("s1", "p1"), true);
  assert.equal(presence.leave("s1", "p1"), false, "leaving an absent participant is a no-op");
  assert.deepEqual(presence.online("s2"), ["p2"]);
});
