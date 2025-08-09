Family Chat - Firebase-based web chat
====================================

How to use:
1. Extract this folder to your computer.
2. You already provided firebase-config.js with your Firebase project details.
   - In the Firebase console, make sure:
     - Authentication -> Sign-in method -> Email/Password is enabled
     - Realtime Database is enabled and rules allow read/write during development:
       {
         "rules": {
           ".read": true,
           ".write": true
         }
       }
   - Go to Project Settings -> General -> Your apps -> Add web app, etc. (you already did)
3. Open register.html in your browser and create an account.
4. After registering or logging in, open chat.html to send/receive messages.
5. To host on GitHub Pages:
   - Create a repo and push these files to the repo's main branch.
   - In repo settings, enable GitHub Pages (use root branch).
   - Your site will be available at https://<username>.github.io/<repo> 

Notes:
- This is a minimal starter app. For production, tighten Realtime Database rules and secure your project.
- You may want to enable Firebase Hosting later for HTTPS and better integration.
