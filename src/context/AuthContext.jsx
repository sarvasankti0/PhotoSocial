import { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  onAuthStateChanged,
  signOut as firebaseSignOut,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from "firebase/auth";
import { auth, googleProvider } from "../firebase";
import { ensureUserProfile, fetchUser, subscribeUser } from "../services/users";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [status, setStatus] = useState("loading"); // loading | signed-in | signed-out

  useEffect(() => {
    // Complete a redirect-based sign-in (fallback when popups are blocked).
    getRedirectResult(auth).catch((err) => {
      if (err?.code) console.warn("Redirect sign-in result error", err.code);
    });

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setFirebaseUser(user);
        try {
          await ensureUserProfile(user);
        } catch (err) {
          console.error("Failed to ensure profile", err);
        }
        const fetched = await fetchUser(user.uid).catch(() => null);
        setProfile(fetched || { uid: user.uid, displayName: user.displayName, email: user.email, photoURL: user.photoURL, username: "", bio: "", onboarded: false });
        setStatus("signed-in");
      } else {
        setFirebaseUser(null);
        setProfile(null);
        setStatus("signed-out");
      }
    });
    return unsubscribe;
  }, []);

  // Keep the profile live: name, photo, username and counts update instantly
  // when the users/{uid} document changes (from any device or action).
  useEffect(() => {
    if (!firebaseUser) return;
    return subscribeUser(
      firebaseUser.uid,
      (user) => {
        if (!user) return;
        setProfile(user);
        window.dispatchEvent(new CustomEvent("ps:profile-updated"));
      },
      () => {}
    );
  }, [firebaseUser]);

  const signInWithGoogle = async () => {
    await signInWithPopup(auth, googleProvider);
  };

  const signInWithGoogleRedirect = async () => {
    await signInWithRedirect(auth, googleProvider);
  };

  const signInWithEmail = async (email, password) => {
    await signInWithEmailAndPassword(auth, email, password);
  };

  const signUpWithEmail = async (email, password) => {
    await createUserWithEmailAndPassword(auth, email, password);
  };

  const signOut = async () => {
    await firebaseSignOut(auth);
  };

  const refreshProfile = async () => {
    if (!firebaseUser) return null;
    const fetched = await fetchUser(firebaseUser.uid, { force: true }).catch(() => null);
    setProfile(fetched || profile);
    if (fetched) {
      window.dispatchEvent(new CustomEvent("ps:profile-updated"));
    }
    return fetched;
  };

  const value = useMemo(
    () => ({
      firebaseUser,
      profile,
      status,
      isAuthenticated: status === "signed-in",
      needsOnboarding: status === "signed-in" && profile?.onboarded !== true,
      signInWithGoogle,
      signInWithGoogleRedirect,
      signInWithEmail,
      signUpWithEmail,
      signOut,
      refreshProfile,
      setProfile,
    }),
    [firebaseUser, profile, status]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
