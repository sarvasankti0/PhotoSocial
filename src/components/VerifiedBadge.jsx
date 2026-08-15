import { BadgeCheck } from "lucide-react";

/**
 * Small blue verified tick shown next to a verified user's name.
 */
export default function VerifiedBadge({ size = 16, title = "Verified account" }) {
  return <BadgeCheck size={size} className="verified-badge" aria-label={title} title={title} />;
}
