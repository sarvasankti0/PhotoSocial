import {
  doc,
  collection,
  query,
  orderBy,
  limit,
  where,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
  increment,
  writeBatch,
  onSnapshot,
} from "firebase/firestore";
import { db } from "../firebase";
import { postsCollection } from "./posts";
import { isVerified } from "../lib/verified";

export function userDoc(uid) {
  return doc(db, "users", uid);
}

export function usersCollection() {
  return collection(db, "users");
}

const profileCache = new Map();

function cacheProfile(user) {
  if (user && user.uid) profileCache.set(user.uid, user);
}

/**
 * Fetch a user profile (with a short-lived in-memory cache).
 * @param {string} uid
 * @param {{ force?: boolean }} [options] - force bypasses the cache (after profile edits)
 */
export async function fetchUser(uid, options = {}) {
  if (!options.force && profileCache.has(uid)) return profileCache.get(uid);
  const snapshot = await getDoc(userDoc(uid));
  if (!snapshot.exists()) return null;
  const user = { uid, ...snapshot.data() };
  cacheProfile(user);
  return user;
}

/**
 * Fetch profiles for many users with a single round of reads (deduped + cached).
 * Missing profiles are returned as null entries.
 * @param {string[]} ids
 */
export async function fetchUsersByIds(ids) {
  const unique = [...new Set(ids.filter(Boolean))];
  const missing = unique.filter((id) => !profileCache.has(id));
  const results = new Map();

  if (missing.length > 0) {
    const snapshots = await Promise.all(missing.map((id) => getDoc(userDoc(id))));
    snapshots.forEach((snap) => {
      if (snap.exists()) {
        const user = { uid: snap.id, ...snap.data() };
        cacheProfile(user);
        results.set(user.uid, user);
      }
    });
  }

  return unique.map((id) => {
    if (results.has(id)) return results.get(id);
    if (profileCache.has(id)) return profileCache.get(id);
    return null;
  });
}

/**
 * Merge live author profile info onto a list of posts.
 * Live displayName / photoURL win over the denormalized snapshot fields.
 * Authors are resolved by id (not by array position) so repeated authors in
 * the list can never be cross-attributed to the wrong post.
 * @param {Array} posts
 */
export async function hydratePostsAuthors(posts) {
  const ids = [...new Set(posts.map((p) => p.authorId).filter(Boolean))];
  const profiles = await fetchUsersByIds(ids);
  const byId = new Map(profiles.map((author) => [author?.uid, author]));
  return posts.map((post) => {
    const author = byId.get(post.authorId);
    if (!author) return post;
    return {
      ...post,
      authorName: author.displayName || post.authorName,
      authorPhotoURL: author.photoURL || post.authorPhotoURL,
      authorUsername: author.username,
      authorIsPrivate: Boolean(author.isPrivate),
      authorIsVerified: isVerified(author),
      authorAllowDownloads: author.allowDownloads !== false,
      authorAllowPerPostDownloads: author.allowPerPostDownloads !== false,
    };
  });
}

/**
 * Grant or revoke the verified tick on a user profile.
 * Security rules only permit the official developer account to make this
 * change (and only ever to the isVerified field).
 * @param {string} uid
 * @param {boolean} isVerified
 */
export async function setUserVerified(uid, isVerified) {
  if (!uid) return;
  await updateDoc(userDoc(uid), { isVerified: Boolean(isVerified) });
}

export function clearProfileCache() {
  profileCache.clear();
}

function lower(value) {
  return (value || "").toString().trim().toLowerCase();
}

function defaultUsername(firebaseUser) {
  const base = lower(firebaseUser.displayName).replace(/\s+/g, ".") || firebaseUser.uid.slice(0, 8);
  return base.replace(/[^a-z0-9._]/g, "").slice(0, 30) || firebaseUser.uid.slice(0, 8);
}

/**
 * Create the user profile document after sign-in.
 * Safe to call repeatedly (setDoc merges).
 * @param {import("firebase/auth").User} firebaseUser
 * @param {{ username?: string }} [options]
 */
export async function ensureUserProfile(firebaseUser, options = {}) {
  if (!firebaseUser) return null;

  const ref = userDoc(firebaseUser.uid);
  const snapshot = await getDoc(ref);

  const base = {
    displayName: firebaseUser.displayName || "",
    email: firebaseUser.email || "",
    photoURL: firebaseUser.photoURL || "",
    username: options.username || defaultUsername(firebaseUser),
    bio: "",
    followersCount: 0,
    followingCount: 0,
    postsCount: 0,
    isPrivate: false,
    allowDownloads: true,
    allowPerPostDownloads: true,
    followRequestNotifications: true,
    showFollowersList: true,
    showFollowingList: true,
  };

  if (snapshot.exists()) {
    const existing = snapshot.data();
    const update = {};
    if (!existing.displayName && base.displayName) update.displayName = base.displayName;
    if (!existing.email && base.email) update.email = base.email;
    if (!existing.photoURL && base.photoURL) update.photoURL = base.photoURL;
    if (options.username && options.username !== existing.username) update.username = options.username;
    if (existing.username && !existing.usernameLower) update.usernameLower = lower(existing.username);
    if (existing.displayName && !existing.displayNameLower) update.displayNameLower = lower(existing.displayName);
    if (existing.onboarded === undefined) update.onboarded = existing.username ? existing.onboarded ?? false : false;

    if (Object.keys(update).length > 0) {
      await updateDoc(ref, { ...update, lastSeenAt: serverTimestamp() });
    }
    return { uid: firebaseUser.uid, ...existing, ...update };
  }

  await setDoc(ref, {
    ...base,
    usernameLower: lower(base.username),
    displayNameLower: lower(base.displayName),
    onboarded: false,
    createdAt: serverTimestamp(),
    lastSeenAt: serverTimestamp(),
  });

  return { uid: firebaseUser.uid, ...base, onboarded: false };
}

/**
 * Update a user's editable profile fields.
 * @param {string} uid
 * @param {object} fields - e.g. { displayName, username, bio, photoURL, onboarded }
 */
export async function updateUserProfile(uid, fields) {
  const clean = {};
  if (fields.displayName !== undefined) {
    clean.displayName = (fields.displayName || "").trim();
    clean.displayNameLower = lower(clean.displayName);
  }
  if (fields.username !== undefined) {
    clean.username = (fields.username || "").trim();
    clean.usernameLower = lower(clean.username);
  }
  if (fields.bio !== undefined) clean.bio = (fields.bio || "").trim();
  if (fields.photoURL !== undefined) clean.photoURL = fields.photoURL;
  if (fields.onboarded !== undefined) clean.onboarded = Boolean(fields.onboarded);

  if (Object.keys(clean).length === 0) return;
  await updateDoc(userDoc(uid), clean);
}

/**
 * Search users by username OR display name prefix (case-insensitive).
 * Runs two prefix queries (usernameLower and displayNameLower), merges the
 * results, dedupes by uid and sorts alphabetically by username.
 * @param {string} term
 * @param {number} maxResults
 */
export async function searchUsers(term, maxResults = 20) {
  const trimmed = lower(term);
  if (!trimmed) return [];

  const byUsername = query(
    usersCollection(),
    where("usernameLower", ">=", trimmed),
    where("usernameLower", "<=", trimmed + "\uf8ff"),
    orderBy("usernameLower"),
    limit(maxResults)
  );
  const byDisplayName = query(
    usersCollection(),
    where("displayNameLower", ">=", trimmed),
    where("displayNameLower", "<=", trimmed + "\uf8ff"),
    orderBy("displayNameLower"),
    limit(maxResults)
  );

  const [usernameSnap, displaySnap] = await Promise.all([getDocs(byUsername), getDocs(byDisplayName)]);
  const seen = new Set();
  const results = [];
  for (const snap of [usernameSnap, displaySnap]) {
    for (const docSnap of snap.docs) {
      if (seen.has(docSnap.id)) continue;
      seen.add(docSnap.id);
      results.push({ uid: docSnap.id, ...docSnap.data() });
    }
  }
  results.sort((a, b) => (a.username || "").localeCompare(b.username || ""));
  return results.slice(0, maxResults);
}

/**
 * Check whether a username is available (ignoring the caller's own uid).
 * @param {string} username
 * @param {string} [excludeUid]
 */
export async function isUsernameAvailable(username, excludeUid) {
  const trimmed = lower(username);
  if (!trimmed) return false;

  const q = query(
    usersCollection(),
    where("usernameLower", "==", trimmed),
    limit(2)
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.every((d) => d.id === excludeUid);
}

/**
 * Increment a count field on a user profile.
 * @param {string} uid
 * @param {"followersCount"|"followingCount"|"postsCount"} field
 * @param {number} delta
 */
export async function adjustUserCount(uid, field, delta) {
  if (!uid || !field) return;
  await updateDoc(userDoc(uid), { [field]: increment(delta) });
}

/**
 * Live subscription to a user profile document. Calls onNext(null) when the
 * document does not exist.
 * @param {string} uid
 * @param {(user: object | null) => void} onNext
 * @param {(err: Error) => void} [onError]
 * @returns {() => void} unsubscribe
 */
export function subscribeUser(uid, onNext, onError) {
  if (!uid) return () => {};
  return onSnapshot(
    userDoc(uid),
    (snap) => onNext(snap.exists() ? { uid: snap.id, ...snap.data() } : null),
    onError
  );
}

export const PRIVACY_FIELDS = [
  "isPrivate",
  "allowDownloads",
  "allowPerPostDownloads",
  "followRequestNotifications",
  "showFollowersList",
  "showFollowingList",
];

/**
 * Update a user's privacy settings. When the account switches between
 * Public and Private, every existing post is updated immediately so the new
 * privacy rule applies to old content too.
 * @param {string} uid
 * @param {object} fields
 */
export async function updatePrivacySettings(uid, fields) {
  if (!uid) return;
  const clean = {};
  for (const key of PRIVACY_FIELDS) {
    if (fields[key] !== undefined) clean[key] = Boolean(fields[key]);
  }
  if (Object.keys(clean).length === 0) return;

  const prev = await getDoc(userDoc(uid)).then((s) => (s.exists() ? s.data() : {}));
  await updateDoc(userDoc(uid), clean);

  // A Public <-> Private switch must immediately protect/unprotect old posts.
  if (fields.isPrivate !== undefined && Boolean(fields.isPrivate) !== Boolean(prev.isPrivate)) {
    const q = query(
      postsCollection(),
      where("authorId", "==", uid),
      limit(500)
    );
    const snapshot = await getDocs(q);
    if (snapshot.docs.length > 0) {
      const batch = writeBatch(db);
      snapshot.docs.forEach((docSnap) => {
        batch.update(doc(db, "posts", docSnap.id), { isPrivate: clean.isPrivate });
      });
      await batch.commit();
    }
  }
}

/**
 * Whether a viewer may see a given post, based on the author's current
 * privacy and whether the viewer is an approved follower. Mirrors the
 * backend security rules.
 * @param {object} post
 * @param {{ viewerUid?: string, followsAuthor?: boolean }} opts
 */
export function isPostVisibleTo(post, { viewerUid, followsAuthor } = {}) {
  if (!post) return false;
  const authorIsPrivate = post.authorIsPrivate ?? post.isPrivate === true;
  if (!authorIsPrivate) return true;
  if (viewerUid && post.authorId === viewerUid) return true;
  return Boolean(viewerUid && followsAuthor);
}

/**
 * Fetch the profile docs of everyone who follows `uid`.
 * @param {string} uid
 * @param {number} max
 */
export async function fetchFollowers(uid, max = 100) {
  if (!uid) return [];
  const q = query(collection(db, "users", uid, "followers"), limit(max));
  const snap = await getDocs(q);
  const ids = snap.docs.map((d) => d.id);
  const profiles = await fetchUsersByIds(ids);
  return profiles.filter(Boolean);
}

/**
 * Fetch the profile docs of everyone `uid` follows.
 * @param {string} uid
 * @param {number} max
 */
export async function fetchFollowing(uid, max = 100) {
  if (!uid) return [];
  const q = query(collection(db, "users", uid, "following"), limit(max));
  const snap = await getDocs(q);
  const ids = snap.docs.map((d) => d.id);
  const profiles = await fetchUsersByIds(ids);
  return profiles.filter(Boolean);
}

/**
 * Remove a follower (owner-initiated). The removed user immediately loses
 * access to the owner's private posts.
 * @param {string} ownerUid
 * @param {string} followerUid
 */
export async function removeFollower(ownerUid, followerUid) {
  if (!ownerUid || !followerUid || ownerUid === followerUid) return;
  const batch = writeBatch(db);
  batch.delete(doc(db, "users", ownerUid, "followers", followerUid));
  batch.delete(doc(db, "users", followerUid, "following", ownerUid));
  batch.update(userDoc(ownerUid), { followersCount: increment(-1) });
  batch.update(userDoc(followerUid), { followingCount: increment(-1) });
  await batch.commit();
}
