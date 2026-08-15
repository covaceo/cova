import React, { useState } from "react";
import ReactDOM from "react-dom/client";
import { AuthSheet } from "../../src/components/AuthPanels";
import "../../src/index.css";
import "../../src/styles/riskDeskVisualSystem.css";
import "../../src/styles/operatorDossierRevamp.css";
import "../../src/styles/cobaltMarket.css";

function Harness() {
  const [mode, setMode] = useState<"login" | "signup">("signup");

  return (
    <main className="min-h-screen bg-[#070a0f] text-white">
      <button data-harness-background type="button">Background control</button>
      <AuthSheet
        authIntentKey="cova-auth-email-requested-browser"
        close={() => {}}
        mode={mode}
        onAuthenticated={() => {}}
        onAuthAttemptAborted={() => {}}
        onAuthSessionIsCurrent={() => true}
        onAuthAttemptStarted={() => 1}
        onDeleteRestrictedAccount={async () => {}}
        onDevPreview={() => {}}
        onDiscardAuthSession={async () => {}}
        onDisconnectProviders={async () => {}}
        onInspectProviders={async () => {}}
        onPasswordRecovered={() => {}}
        onPolicyAccepted={async () => {}}
        onUpdatePassword={async () => {}}
        passwordRecovery={false}
        pendingPolicyConfirmation={false}
        setMode={setMode}
      />
    </main>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Harness />
  </React.StrictMode>,
);
