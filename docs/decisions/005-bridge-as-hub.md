# 005 — Bridge as hub

**Status:** Accepted

**Decision.** A bridge runs on every installation. Phones and browsers connect to it; it keeps the
shared control state, grants the control lease (one device controls, others view, the studio always
wins), logs commands, serves the local web pult and sends OSC to the installation. Direct OSC from the
phone is a fallback without sync or lease.
