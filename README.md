# Secret Calculator Chat (Firebase + Netlify/Vercel)

A free, static, calculator-entry chat app using Firebase Authentication and Firestore. Hosted on Netlify or Vercel.

- Calculator UI serves as lock screen after login.
- Users register with email/password, set a numeric passcode (hashed with SHA-256 and stored in Firestore).
- One-to-one chats with text or TikTok video URLs (embedded inline using TikTok's embed).
- Real-time updates via Firestore onSnapshot listeners.
- Presence: `isOnline` and `lastActive` updated on login, logout, and every minute while online.

## Setup
1. Create a Firebase project at https://console.firebase.google.com
2. Enable Authentication: Email/Password provider.
3. Enable Firestore (in test mode for development; add secure rules before production).
4. In Project Settings -> General -> Your apps -> Web app, copy the Firebase config snippet and paste it into `firebase-config.js`.

## Firestore Structure
- Collection `users/{uid}`: { uid, email, username, passcodeHash, isOnline, lastActive, createdAt }
- Collection `chats/{chatId}`: { users: [uidA, uidB], updatedAt }
  - Subcollection `messages/{autoId}`: { from, to, type: 'text'|'tiktok', text?, url?, createdAt }

`chatId` is `sorted([uidA, uidB]).join('_')`.

## Recommended Firestore Rules (tighten as needed)
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function isSignedIn() { return request.auth != null; }
    function isSelf(uid) { return isSignedIn() && request.auth.uid == uid; }

    match /users/{uid} {
      allow read: if isSignedIn();
      allow create: if isSelf(uid);
      allow update: if isSelf(uid);
    }

    match /chats/{chatId} {
      allow read, create, update: if isSignedIn();
      match /messages/{msgId} {
        allow read: if isSignedIn();
        allow create: if isSignedIn() &&
          request.resource.data.from == request.auth.uid &&
          request.resource.data.createdAt == request.time &&
          (request.resource.data.type in ['text','tiktok']);
      }
    }
  }
}
```
Note: Server timestamps are checked loosely here. You may simplify during development.

## Run Locally
- Simply open `index.html` via a local server (some browsers block `dialog` without a server). For example:
  - VS Code Live Server extension, or
  - `npx serve` in this folder.

## Deploy
- Netlify: drag-and-drop the folder or connect a repo. Set build command empty and publish directory as root.
- Vercel: import the repo as a static site.

## Notes
- Only Auth + Firestore are used; no Storage, keeping the project free on the Spark plan within limits.
- Presence using Firestore cannot catch abrupt disconnects perfectly; we update `isOnline` on interval and on unload.
- TikTok embeds are created by inserting the official embed and loading `https://www.tiktok.com/embed.js`.
