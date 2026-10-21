# 003 — iOS first

**Status:** Accepted

**Decision.** MVP ships on iOS via TestFlight, then the App Store. Android is a later phase: platform
code sits behind TS interfaces, every dependency must support Android, Android keeps compiling in CI.
