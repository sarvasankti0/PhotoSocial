import { useState } from "react";
import SignIn from "./auth/SignIn";
import SignUp from "./auth/SignUp";

/**
 * Auth entry point. Renders the sign-in or create-account page; both are
 * separate files under ./auth so each page has its own file path.
 */
export default function Auth() {
  const [mode, setMode] = useState("signin");

  if (mode === "signup") {
    return <SignUp onSwitchMode={setMode} />;
  }
  return <SignIn onSwitchMode={setMode} />;
}
