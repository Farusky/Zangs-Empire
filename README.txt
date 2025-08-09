Upgraded Family Chat - README
============================

What's included:
- Auth (email/password + forgot + profile image)
- Private 1:1 chats (deterministic chat id)
- Group chats (create groups by email list)
- File uploads (images & documents) via Firebase Storage
- Simple presence set to 'online' on login (basic)
- WhatsApp-like dark green UI: sidebar with chats and main chat pane
- No video/voice calls (per your request)

Important setup steps (you already provided firebase-config.js):
1. In Firebase Console -> Authentication: enable Email/Password sign-in.
2. In Realtime Database: create a database and set rules for development (open):
{
  "rules": {
    ".read": true,
    ".write": true
  }
}
   For production lock these rules!
3. In Storage: set rules for development (open):
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /{allPaths=**} {
      allow read, write: if true;
    }
  }
}
4. Serve files via HTTP (don't open file://). For local testing run:
   python -m http.server 8000
   then open http://localhost:8000/auth.html
5. Create accounts via Register tab. Then open App by logging in (redirects to app.html).

Notes & limitations:
- This is a functional starter. It is intentionally simple and uses Realtime Database for quick prototyping.
- Security rules are wide open for development. Before going public, tighten DB and Storage rules to restrict reads/writes to authorized users.
- Message ordering and pagination are minimal (onChildAdded). For many messages add pagination.
- Presence/typing are simple; for robust presence use onDisconnect and serverTimestamp patterns.
- Group membership uses user emails to map to UIDs; ensure members exist.

Questions? Want me to tighten rules, add message read receipts, or deploy to GitHub Pages for you? Reply and I'll do it.
