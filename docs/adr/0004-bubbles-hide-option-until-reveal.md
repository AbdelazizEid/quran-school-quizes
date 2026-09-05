# Bubbles show answer status, not chosen option, until reveal

During a live Competition Question, a Participant's Bubble on the host screen lights up neutrally to show *that* they answered — never *which* option they picked. Option identity (correct/wrong tints, distribution) appears only when the Teacher reveals the answer. The host screen is projected to the whole class; option-colored glows during the question would let Students copy the majority answer off the projector, quietly breaking the game.

**Consequence**: the socket protocol must carry per-participant answer identity (participantId) to the host room during questions — the existing `answers-update` event gains an `answered: participantId[]` field alongside its aggregate per-option counts. Per-student correct/wrong data at reveal was already part of the reveal state.
