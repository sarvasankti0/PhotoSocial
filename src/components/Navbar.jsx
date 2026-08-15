import { Camera, Home, Search, PlusSquare, Bell, LogOut, UserCircle2 } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import Avatar from "./Avatar";
import useUnreadNotifications from "../hooks/useUnreadNotifications";

const tabs = [
  { key: "home", label: "Home", icon: Home },
  { key: "search", label: "Search", icon: Search },
  { key: "create", label: "Create", icon: PlusSquare },
  { key: "activity", label: "Activity", icon: Bell },
  { key: "profile", label: "Profile", icon: UserCircle2 },
];

export default function Navbar({ activeTab, onNavigate, onSignOut }) {
  const { profile, firebaseUser } = useAuth();
  const unread = useUnreadNotifications(firebaseUser?.uid);

  return (
    <header className="navbar">
      <div className="navbar-inner">
        <button className="brand" onClick={() => onNavigate("home")} aria-label="PhotoSocial home">
          <span className="brand-mark">
            <Camera size={22} />
          </span>
          <span className="brand-name">PhotoSocial</span>
        </button>

        <nav className="navbar-links" aria-label="Primary">
          {tabs.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              className={`nav-link ${activeTab === key ? "is-active" : ""}`}
              onClick={() => onNavigate(key)}
              aria-current={activeTab === key ? "page" : undefined}
            >
              {key === "profile" && profile?.photoURL ? (
                <Avatar src={profile.photoURL} size={30} />
              ) : (
                <Icon size={20} />
              )}
              <span>{label}</span>
              {key === "activity" && unread > 0 && (
                <span className="nav-badge nav-badge-inline">{unread > 9 ? "9+" : unread}</span>
              )}
            </button>
          ))}
        </nav>

        <button className="icon-button signout-button" onClick={onSignOut} title="Sign out" aria-label="Sign out">
          <LogOut size={20} />
        </button>
      </div>
    </header>
  );
}
