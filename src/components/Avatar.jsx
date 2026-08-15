import { useState } from "react";
import { User } from "lucide-react";

export default function Avatar({ src, alt = "", size = 40, className = "" }) {
  const [failed, setFailed] = useState(false);

  return (
    <span
      className={`avatar ${className}`}
      style={{ width: size, height: size }}
      aria-label={alt}
    >
      {src && !failed ? (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="avatar-fallback">
          <User size={size * 0.5} />
        </span>
      )}
    </span>
  );
}
