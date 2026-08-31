# Auth via Clerk

Clerk is used for authentication; Teachers and Practice Students sign up with either mobile phone number (SMS OTP) or email. Auth lives outside the single-Node deployment — Clerk + SMS provider is the trade-off chosen to avoid building mobile OTP ourselves. Self-hosted credentials+JWT was considered; it was rejected to keep time-to-market and OTP complexity out of scope.
