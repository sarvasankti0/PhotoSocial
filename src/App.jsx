import { useEffect, useState } from "react";
import { LogOut, X } from "lucide-react";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { StatusProvider } from "./context/StatusContext";
import Navbar from "./components/Navbar";
import BottomNav from "./components/BottomNav";
import { FullScreenLoader } from "./components/Loading";
import Loading from "./components/Loading";
import Auth from "./pages/Auth";
import Onboarding from "./pages/Onboarding";
import Home from "./pages/Home";
import Search from "./pages/Search";
import CreatePost from "./components/CreatePost";
import Activity from "./pages/Activity";
import Profile from "./pages/Profile";
import PostPage from "./pages/PostPage";

const VALID_PAGES = ["home", "search", "create", "activity", "profile"];

/**
 * Parse the current URL path into a route object.
 * Supported: /home, /search, /create, /activity, /profile, /profile/:id, /post/:code
 * Anything else falls back to home.
 */
function parsePath(pathname) {
  const parts = pathname.split("/").filter(Boolean);
  const first = parts[0] || "";
  if (first === "post") {
    return { page: "post", postCode: parts[1] || null };
  }
  if (VALID_PAGES.includes(first)) {
    return { page: first, profileId: first === "profile" ? parts[1] || null : null };
  }
  return { page: "home", profileId: null };
}

function buildPath(page, arg) {
  if (page === "profile") {
    return arg ? `/profile/${encodeURIComponent(arg)}` : "/profile";
  }
  if (page === "post") {
    return arg ? `/post/${encodeURIComponent(arg)}` : "/post";
  }
  return `/${page}`;
}

function Shell() {
  const { isAuthenticated, status, needsOnboarding, signOut } = useAuth();
  const [route, setRoute] = useState(() => parsePath(window.location.pathname));
  const [confirmingSignOut, setConfirmingSignOut] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  // Normalize the initial URL and keep the UI in sync with the browser's
  // back/forward buttons (popstate) and programmatic navigation (ps:navigate).
  useEffect(() => {
    const initial = parsePath(window.location.pathname);
    const wanted = buildPath(initial.page, initial.page === "post" ? initial.postCode : initial.profileId);
    if (wanted !== window.location.pathname) {
      window.history.replaceState({}, "", wanted);
    }
    setRoute(initial);

    const onPopState = () => {
      setRoute(parsePath(window.location.pathname));
      window.scrollTo({ top: 0 });
    };
    const onNavigate = (e) => {
      applyNavigation(e.detail || "home");
    };
    window.addEventListener("popstate", onPopState);
    window.addEventListener("ps:navigate", onNavigate);
    return () => {
      window.removeEventListener("popstate", onPopState);
      window.removeEventListener("ps:navigate", onNavigate);
    };
  }, []);

  const applyNavigation = (page, arg = null) => {
    const wanted = buildPath(page, arg);
    const current = window.location.pathname;
    if (wanted !== current) {
      window.history.pushState({}, "", wanted);
    }
    setRoute(page === "post" ? { page, postCode: arg } : { page, profileId: arg });
    window.scrollTo({ top: 0 });
  };

  if (status === "loading") return <FullScreenLoader />;

  if (!isAuthenticated) return <Auth />;

  if (needsOnboarding) {
    return <Onboarding onDone={() => applyNavigation("home")} />;
  }

  const navigate = (next) => applyNavigation(next);

  const openProfile = (authorId) => applyNavigation("profile", authorId);

  const requestSignOut = () => {
    setConfirmingSignOut(true);
  };

  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await signOut();
      window.history.replaceState({}, "", "/home");
      setRoute({ page: "home", profileId: null });
    } finally {
      setSigningOut(false);
      setConfirmingSignOut(false);
    }
  };

  const cancelSignOut = () => {
    if (signingOut) return;
    setConfirmingSignOut(false);
  };

  const renderPage = () => {
    switch (route.page) {
      case "search":
        return <Search onOpenProfile={openProfile} />;
      case "create":
        return <CreatePost onPublished={() => navigate("home")} />;
      case "activity":
        return <Activity onOpenProfile={openProfile} />;
      case "profile":
        return <Profile profileId={route.profileId} onOpenProfile={openProfile} />;
      case "post":
        return <PostPage code={route.postCode} onOpenProfile={openProfile} />;
      case "home":
      default:
        return <Home onOpenProfile={openProfile} />;
    }
  };

  return (
    <div className="app-shell">
      <Navbar activeTab={route.page} onNavigate={navigate} onSignOut={requestSignOut} />
      <main className="app-content">{renderPage()}</main>
      <BottomNav activeTab={route.page} onNavigate={navigate} />

      {confirmingSignOut && (
        <div className="modal-overlay" onClick={cancelSignOut}>
          <div
            className="modal-card"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Sign out confirmation"
          >
            <header className="modal-card-header">
              <h3>Sign out?</h3>
              <button className="icon-button" onClick={cancelSignOut} disabled={signingOut} aria-label="Close">
                <X size={22} />
              </button>
            </header>
            <div className="modal-card-body">
              <p>Are you sure you want to sign out of PhotoSocial?</p>
              <div className="modal-actions">
                <button className="secondary-button" onClick={cancelSignOut} disabled={signingOut}>
                  Cancel
                </button>
                <button className="primary-button" onClick={handleSignOut} disabled={signingOut}>
                  {signingOut ? <Loading size={18} /> : <LogOut size={16} />}
                  {signingOut ? "Signing out..." : "Sign out"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <StatusProvider>
        <Shell />
      </StatusProvider>
    </AuthProvider>
  );
}
