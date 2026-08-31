# Quran School

A Kahoot-style web application for a Quran school. Teachers build question sets on Quranic material; students answer them either self-paced or in live, synchronized sessions.

## Language

**Question**:
A single item in a Quiz. Three kinds are supported: Multiple Choice (up to 4 options, exactly one correct), True/False, and Input (free-text response). Competitions use only Multiple Choice and True/False; Practice can use all three.
_Avoid_: item, prompt

**Input Answer**:
The free-text response a Student gives to an Input Question. It is stored and later marked by a Teacher — it is not auto-graded.
_Avoid_: review, submission

**Quiz**:
A reusable set of questions on Quranic material (surahs, ayahs, tajwid, meaning). A Quiz is not tied to how it is played; it can be launched in either mode.
_Avoid_: test, exam, question bank

**Quiz Copy**:
A Teacher can share a Quiz so that another Teacher can copy it into their own library. A copy is detached from the original — edits no longer propagate.
_Avoid_: share, clone, template

**Competition**:
A live, synchronized session where a teacher launches a Quiz and students join in real time via QR code or invite code. Scoring is Kahoot-style speed scoring (up to ~1000 points, faster answers score more). Its leaderboard and per-student answers are kept after the session ends.
_Avoid_: game, match, live quiz

**Question Time Limit**:
The time a Student has to answer a Question in a Competition. Default 20 seconds, adjustable by the Teacher per Question at launch.
_Avoid_: timeout, delay

**Practice**:
A self-paced launch of a Quiz where a signed-in Student answers on their own schedule. Its per-student answers and score history are kept so teachers can review progress.
_Avoid_: solo quiz, self test

**Track**:
One of the two ways a Quiz can be launched: Practice (self-paced) or Competition (live).
_Avoid_: mode, way

**Student**:
A person who answers quizzes. For Practice (self-paced Quiz), a Student must create an account and sign in. For a Competition (live session), a Student joins with just a nickname — no account needed.
_Avoid_: player, user, learner

**Teacher**:
A registered person who creates Quizzes and launches them as Practice or live Competitions. Teachers always have accounts.
_Avoid_: host, admin, instructor

**Teacher Dashboard**:
The authenticated interface where a Teacher creates and manages Quizzes and Questions, launches Practice/Competitions, and reviews Results.
_Avoid_: admin panel, studio

**Deployment**:
Self-hosted on a VPS (no serverless platform). Single Node process serving Next.js + Socket.IO inside the same runtime.
_Avoid_: hosting

**Auth**:
Clerk is used for authentication. Teachers sign in via Clerk; Students sign in for Practice with mobile phone number or email, verified via SMS OTP (or email OTP). External dependency is accepted in exchange for managed OTP and fast delivery.
_Avoid_: login, password

**e2e Tests**:
Playwright e2e tests are required for live session flows (lobby → question → score → leaderboard), join via QR/code, and Quiz CRUD. Planned before packaging v1; currently not yet installed.
_Avoid_: end-to-end

**UI Language**:
The interface language. v1 is Arabic-only with right-to-left (RTL) layout. Internationalization framework remnants are not used in v1.
_Avoid_: locale

**Thamanyah Font** (also stylized Thmanyah / خط ثمانية):
The project's Arabic typeface family. The free font_ship released by thmanyah.com has three families: Thmanyah Serif Display (headings), Thmanyah Serif Text (body), and Thmanyah Sans (UI). Each ships in 5 weights. Licensed freely for personal and commercial use (see https://font.thmanyah.com/).
_Avoid_: Thamana, brand-less font

**Competition Session**:
A recorded instance of a Teacher launching a Quiz as a live Competition, plus the resulting Leaderboard and per-student answers.
_Avoid_: game instance, run

**Join Code**:
A short numeric code (6–7 digits) that Students enter to join a Competition Session, alongside a QR code pointing at the same join URL.
_Avoid_: PIN, invite

**Lobby**:
The waiting area of a Competition Session where joined Students appear, each with a Nickname that is unique within that Session.
_Avoid_: waiting room
