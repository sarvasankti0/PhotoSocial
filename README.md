# PhotoSocial

A production-style, Instagram-inspired **photo-sharing social platform** built with
**React + Vite + Firebase**. Real data only — everything you see comes from the
connected Firebase project or the currently authenticated user. No demo data, no mocks.

## Stack

| Layer | Tech |
| --- | --- |
| Frontend | React, Vite, JavaScript/JSX, CSS, Lucide React |
| Backend | Firebase Authentication, Cloud Firestore |
| Serving | `photosocial-d7f07` Firebase project (fixed config in `src/firebaseConfig.js`) |

## Features (V1)

- Google Sign-In with automatic `users/{uid}` profile creation
- **Email / password sign-in**: "Create account" or "Sign in" with a valid email
  and a strong password (min 8 chars, upper + lower + number). Requires
  enabling the provider once in the Firebase console: Authentication → Sign-in
  method → Email/Password.
- **Onboarding** after first sign-in: set your profile photo, display name, unique username (live availability check) and bio
- **Live author profiles**: posts always show the author's current name / photo (reads the live `users/{uid}` doc, cached), so profile edits reflect everywhere instantly
- **Edit profile anytime**: change your display name, username, bio, and profile photo whenever you like (Edit profile → Change photo); the new photo shows everywhere via the live-profile refresh
- Home feed: real posts, newest first, cursor pagination, lazy-loaded images, skeletons
- Photo-only posts: JPEG / PNG / WEBP / GIF accepted, videos rejected
- **Firestore-hosted images**: every photo (posts and avatars) is downscaled to a
  small WebP and stored as a base64 data URL inside the Firestore document —
  no Firebase Storage required. Client-only pipeline, works out of the box.
- Upload pipeline: "Pick -> Preparing image -> Publishing -> Published"
- Like / unlike using Firestore atomic `arrayUnion` / `arrayRemove`
- **Comments with replies**: every comment can be replied to (nested threads)
- **Comment loves**: any signed-in user can love a comment (atomic array ops)
- **Pinned comments**: the post owner can pin / unpin any comment on their post
- Save / bookmark posts at `users/{uid}/savedPosts/{postId}`
- **Activity notifications**: get notified when someone follows you, likes your
  post, or comments / replies on your post. Notifications are stored per user
  at `users/{uid}/notifications`, shown in the Activity page with an unread
  badge on the nav, and auto-marked read when you open the page.
- **Fully realtime (Firestore `onSnapshot`)**: no reloads needed. New posts
  appear in the feed the moment they're published; likes, comment counts and
  saves update live on every card; the unread badge pops the instant someone
  follows / likes / comments; comments and replies stream into the modal;
  profiles, follower counts and follow buttons sync from any device.
- **24-hour statuses (stories)**: post a status photo (with an optional caption)
  from the circle at the top of Home — each status stays live for exactly 24
  hours, then drops off. You can post several statuses; the viewer plays them in
  sequence and a badge on the circle shows how many you have. The status rail
  always sits first on the Home page; tapping any circle opens a full-screen
  story viewer (auto-advancing, tap/arrows to navigate, Esc or X to close). You
  see the statuses of the accounts you follow (their public and private
  statuses alike), alongside your own — follow someone to see their stories.
  Every status can be
  **liked** and **commented on** right from the viewer — hearts and comments are
  realtime, and a comment can be deleted by its author or the status owner. On
  your own status you can edit the caption or delete it from the viewer. Any
  profile picture of a user with an active status gets a story ring; tapping it
  shows two options: **See profile picture** (full-screen zoom) or **See user's
  status**. Statuses live in `users/{uid}/statuses` (one doc per status, with a
  `comments` sub-collection).
- **Tap-to-zoom photos**: tapping any post photo opens a fullscreen lightbox —
  tap again (or use the zoom button) for 1:1 zoom, Esc / backdrop to close.
- **Search**: find people by username OR account/display name AND photos by caption (case-insensitive prefix), with follow buttons and an inline post preview (like / comment / save)
- **Private accounts & follow requests**: mark your account private in Edit profile → Privacy; new followers then require your approval. Pending requests appear in a drawer on your profile and in Activity (Accept / Decline); the requester's button switches to a cancellable "Requested" state and the owner gets a notification.
- **Privacy-aware posts**: private posts are only visible to the author and approved followers. The global feed and search surface public posts only; approved followers see private posts in their home feed and on the author's profile. Followers/following lists can be hidden, and anyone you remove as a follower instantly loses access to your private posts.
- **Download controls**: "Allow downloads" turns downloads on/off globally, and "Per-post download control" adds a download toggle to each post. Non-owners see a Download option in the post menu only when it's enabled.
- **Verified blue tick**: the official developer account (`@photosocialofficial`)
  always shows the blue tick, and sees a "Verify" button on any user's profile
  (next to Follow) to grant or revoke the tick for others. The tick renders
  next to the name on profiles, posts, search results, followers/following
  lists and follow requests.
- Real profiles with real counts and photo grid, edit-profile and follow/unfollow ready
- Empty states everywhere ("No posts yet. Be the first to share a photo.")
- Responsive mobile-first UI with bottom nav on mobile and top nav on desktop

## Getting started

```bash
npm install
npm run dev
```

Sign in with Google and share your first photo. The Firebase project is already
configured in `src/firebaseConfig.js`.

The privacy feature uses two composite indexes on the `posts` collection
(defined in `firestore.indexes.json`). Deploy them once with the Firebase CLI:

```bash
firebase deploy --only firestore:indexes
```

If you skip this step, the first feed/search query that needs an index will
fail and the Firebase console will offer to create it automatically.

### Verified tick setup (one-time)

The rules only let the **official account** toggle verification, identified by
`isOfficial == true` on the writer's own `users/{uid}` doc. To set this up:

1. Sign in with the account that should be `@photosocialofficial` (its username
   must be exactly `photosocialofficial` for the button to appear).
2. In the Firebase console (Firestore → `users` → your user doc), set
   `isOfficial: true`.
3. Deploy the rules so the verify write is allowed:

```bash
firebase deploy --only firestore
```

That account now sees a Verify button on every other user's profile and can
grant/revoke the blue tick. The rules also prevent any user from setting
`isVerified` or `isOfficial` on themselves.

Build for production:

```bash
npm run build
npm run preview
```

## Project structure

```text
src/
├── components/   # Navbar, BottomNav, PostCard, CreatePost, CommentModal, Lightbox, Avatar, Loading
├── pages/        # Home, Profile, Search, Activity, Auth, Onboarding
├── services/     # posts, users, comments, likes, follows, saves, notifications
├── hooks/        # useUnreadNotifications
├── lib/          # imageDataUrl, validators, format
├── context/      # AuthContext
├── firebase.js
├── App.jsx
├── main.jsx
└── styles.css

firestore.rules   # Firestore security rules
```

## Data model

### `users/{uid}`

```text
displayName, username, email, photoURL (may be a base64 data URL), bio,
followersCount, followingCount, postsCount, createdAt,
isPrivate, allowDownloads, allowPerPostDownloads,
followRequestNotifications, showFollowersList, showFollowingList
```

### `posts/{postId}`

```text
authorId, authorName, authorPhotoURL,
imageUrl (base64 data URL stored inline),
mediaType ("photo" in V1), caption, likes[], commentCount,
isPrivate, allowDownloads (optional per-post override), createdAt
```

### `posts/{postId}/comments/{commentId}`

```text
authorId, authorName, authorPhotoURL, text, createdAt,
replyToId, replyToName, loves[], isPinned
```

### Follow relations

```text
users/{uid}/following/{targetId}
users/{uid}/followers/{followerId}
users/{uid}/followRequests/{requesterId}   # pending requests for private accounts
```

### Saved posts

```text
users/{uid}/savedPosts/{postId}
```

### Notifications

```text
users/{uid}/notifications/{notificationId}

type            "follow" | "like" | "comment" | "reply"
actorId         who triggered it
actorName       display name of the actor
actorPhotoURL   avatar of the actor
postId          related post (empty for follows)
snippet         short caption / comment preview
read            whether the owner has seen it
createdAt       timestamp
```

Written when someone follows you, likes your post, or comments on your post.
They are created only when the actor is not the post owner (no self-notifications).

### Images

Post photos and avatars are stored **inside Firestore documents** as base64 data
URLs (compressed WebP), so no separate image bucket is needed:

```text
posts/{postId}.imageUrl        # post photo  (data URL, <= ~500 KB binary)
users/{uid}.photoURL           # avatar      (data URL, <= ~300 KB binary)
```

### Future video support

`mediaType: "video"` is reserved in the schema. No video UI, uploads, or
dependencies exist in V1; the pipeline is designed to accept
`videoUrl`, `thumbnailUrl`, `duration`, `width`, `height` later without
rebuilding the app.

## Image pipeline

Images never leave Firestore. Each one is downscaled and re-encoded to a small
WebP on the client with a plain `<canvas>` (no third-party libraries, web
workers, or runtime CDN fetches), then written into the document as a data URL:

```text
Original photo
   -> validate (photo only, image/*, max 10 MB)
   -> downscale + convert to WebP on a canvas
      - posts:   max 1200px, ~0.3 MB (hard cap ~500 KB)
      - avatars: max 400px,  ~0.15 MB (hard cap ~300 KB)
   -> preview in the UI
   -> store as a base64 data URL:
      posts/{postId}.imageUrl  or  users/{uid}.photoURL
```

The size caps keep every document well under Firestore's 1 MiB limit.

## Security rules

The project ships hardened rules:

- `firestore.rules`: users may only modify their own profiles; posts can be
  created/updated/deleted only by their author; likes/comments mutate only the
  expected fields; comments may only be deleted by their own author;
  followers/following and savedPosts are owner-scoped; statuses are
  owner-writable and readable only by the author or followers of a private
  account; embedded image data URLs are size-capped to protect the 1 MiB
  document limit; notifications can only be created with the actor's own id and
  read/updated/deleted only by their owner.

## Deploying rules

Install the Firebase CLI and log in (run from the repo root, where `.firebaserc`
points at `photosocial-d7f07`):

```bash
npm install -g firebase-tools
firebase login
firebase deploy --only firestore:rules
```

No Firebase Storage or Cloud Functions are required — everything runs on
Firestore and the client.

Never store Firebase Admin credentials or service-account keys in the web app.

## License

Internal demo project. All photos and users are real application data created by
authenticated users — nothing is seeded.
