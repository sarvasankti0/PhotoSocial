import { Home, Search, PlusSquare, Bell, UserCircle2 } from "lucide-react";
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

export default function BottomNav({ activeTab, onNavigate }) {
  const { profile, firebaseUser } = useAuth();
  const unread = useUnreadNotifications(firebaseUser?.uid);

  return (
    <nav className="bottom-nav" aria-label="Mobile">
      {tabs.map(({ key, label, icon: Icon }) => (
        <button
          key={key}
          className={`bottom-nav-item ${activeTab === key ? "is-active" : ""}`}
          onClick={() => onNavigate(key)}
          aria-label={label}
          aria-current={activeTab === key ? "page" : undefined}
        >
          {key === "profile" && profile?.photoURL ? (
            <Avatar src={profile.photoURL} size={26} className="bottom-nav-avatar" />
          ) : (
            <Icon size={24} />
          )}
          {key === "activity" && unread > 0 && (
            <span className="nav-badge">{unread > 9 ? "9+" : unread}</span>
          )}
          <span className="bottom-nav-label">{label}</span>
        </button>
      ))}
    </nav>
  );
}
