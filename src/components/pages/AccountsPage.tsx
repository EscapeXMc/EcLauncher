import { useState, useEffect } from "react";
import { useLauncherStore } from "../../stores";
import { api } from "../../lib/api";
import { GlassCard } from "../ui/GlassCard";
import { GlowButton } from "../ui/GlowButton";
import { GlassInput } from "../ui/FormControls";
import {
  Users, Plus, Trash2, Monitor, Check, ExternalLink, AlertCircle, Shield
} from "lucide-react";

interface Account {
  type: "microsoft" | "elyby" | "offline";
  username: string;
  uuid: string;
  client_token?: string;
  access_token?: string;
  refresh_token?: string;
  token_exp?: number;
}

export function AccountsPage() {
  const { settings, saveSettings, themeColors } = useLauncherStore();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [activeUuid, setActiveUuid] = useState("");
  const [msStep, setMsStep] = useState<"idle" | "polling" | "done" | "error">("idle");
  const [msUserCode, setMsUserCode] = useState("");
  const [msUri, setMsUri] = useState("");
  const [msError, setMsError] = useState("");
  const [elyStep, setElyStep] = useState<"idle" | "polling" | "done" | "error">("idle");
  const [elyAuthUrl, setElyAuthUrl] = useState("");
  const [elyError, setElyError] = useState("");
  const [offlineUsername, setOfflineUsername] = useState("");
  const [skinFile, setSkinFile] = useState<string | null>(null);
  const [skinInfo, setSkinInfo] = useState<{ custom_skin_path: string; has_skin: boolean } | null>(null);

  useEffect(() => {
    const savedAccounts = (settings as any).accounts || [];
    const savedActive = (settings as any).active_account_uuid || "";
    setAccounts(savedAccounts);
    setActiveUuid(savedActive);
  }, [settings]);

  const saveAccounts = async (newAccounts: Account[], newActive?: string) => {
    setAccounts(newAccounts);
    const toSave: Record<string, any> = { accounts: newAccounts };
    if (newActive !== undefined) toSave.active_account_uuid = newActive;
    await saveSettings(toSave);
  };

  const startMicrosoftAuth = async () => {
    setMsStep("polling");
    setMsError("");
    try {
      const result = await api.auth.microsoftStart();
      setMsUserCode(result.user_code);
      setMsUri(result.verification_uri);
      const pollResult = await api.auth.microsoftPoll(result.device_code, result.interval);
      if (pollResult.error) throw new Error(pollResult.error);
      const newAccount: Account = {
        type: "microsoft",
        username: pollResult.username,
        uuid: pollResult.uuid || pollResult.username,
        access_token: pollResult.mc_token,
        refresh_token: pollResult.refresh_token || "",
        token_exp: pollResult.token_exp,
      };
      const newAccounts = [...accounts.filter((a) => a.uuid !== newAccount.uuid), newAccount];
      await saveAccounts(newAccounts, newAccount.uuid);
      setMsStep("done");
    } catch (err: any) {
      console.error("Microsoft auth failed:", err);
      setMsError(err?.toString() || "Authentication failed");
      setMsStep("error");
    }
  };

  const startElybyAuth = async () => {
    setElyStep("polling");
    setElyError("");
    try {
      const result = await api.auth.elybyStart();
      setElyAuthUrl(result.auth_url);
      const pollResult = await api.auth.elybyPoll();
      if (pollResult.error) throw new Error(pollResult.error);
      const newAccount: Account = {
        type: "elyby",
        username: pollResult.username,
        uuid: pollResult.uuid,
        access_token: pollResult.mc_token || pollResult.access_token || "",
        refresh_token: pollResult.refresh_token || "",
      };
      const newAccounts = [...accounts.filter((a) => a.uuid !== newAccount.uuid), newAccount];
      await saveAccounts(newAccounts, newAccount.uuid);
      setElyStep("done");
    } catch (err: any) {
      console.error("Ely.by auth failed:", err);
      setElyError(err?.toString() || "Authentication failed");
      setElyStep("error");
    }
  };

  const addOfflineAccount = async () => {
    if (!offlineUsername.trim()) return;
    try {
      const result = await api.auth.createOffline(offlineUsername.trim());
      const newAccount: Account = {
        type: "offline",
        username: result.username,
        uuid: result.uuid,
      };
      const newAccounts = [...accounts.filter((a) => a.uuid !== result.uuid), newAccount];
      await saveAccounts(newAccounts, newAccounts.length === 1 ? result.uuid : activeUuid);
      setOfflineUsername("");
    } catch (err) {
      console.error("Failed to create offline account:", err);
    }
  };

  const removeAccount = async (uuid: string) => {
    const newAccounts = accounts.filter((a) => a.uuid !== uuid);
    const newActive = activeUuid === uuid ? (newAccounts[0]?.uuid || "") : activeUuid;
    await saveAccounts(newAccounts, newActive);
  };

  const setActive = async (uuid: string) => {
    setActiveUuid(uuid);
    await api.settings.saveOne("active_account_uuid", uuid);
  };

  return (
    <div className="space-y-5 max-w-4xl mx-auto">
      <div className="flex items-center gap-2">
        <Users size={20} style={{ color: themeColors.accent }} />
        <div>
          <h1 className="tinycaps text-xl font-bold gradient-text" style={{ "--accent": themeColors.accent, "--accent2": themeColors.purple || themeColors.blue } as any}>Accounts</h1>
          <p className="text-xs mt-0.5" style={{ color: themeColors.text_muted }}>Manage your Microsoft, Ely.by, and offline accounts</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <GlassCard>
          <div className="flex items-center gap-2 mb-2">
            <Shield size={16} style={{ color: themeColors.accent }} />
            <h3 className="tinycaps text-sm font-semibold" style={{ color: themeColors.text_main }}>Microsoft</h3>
          </div>
          <p className="text-xs mb-3" style={{ color: themeColors.text_muted }}>Sign in with your Microsoft account for official servers</p>
          {msStep === "polling" && msUserCode ? (
            <div className="space-y-2">
              <p className="text-xs" style={{ color: themeColors.text_main }}>Go to <a href={msUri} target="_blank" rel="noreferrer" style={{ color: themeColors.accent }}>{msUri}</a></p>
              <p className="text-xs" style={{ color: themeColors.text_sub }}>Enter code: <span className="font-mono font-bold" style={{ color: themeColors.accent }}>{msUserCode}</span></p>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 rounded-full animate-spin" style={{ borderColor: themeColors.accent, borderTopColor: "transparent" }} />
                <span className="text-xs" style={{ color: themeColors.text_muted }}>Waiting for authentication...</span>
              </div>
            </div>
          ) : msStep === "done" ? (
            <div className="flex items-center gap-2 text-sm" style={{ color: themeColors.success }}>
              <Check size={14} /> Successfully signed in!
            </div>
          ) : (
            <>
              {msError && (
                <div className="flex items-center gap-1 text-xs mb-2" style={{ color: themeColors.danger }}>
                  <AlertCircle size={12} /> {msError}
                </div>
              )}
              <GlowButton size="sm" onClick={startMicrosoftAuth} className="w-full flex items-center justify-center gap-1">
                <Shield size={14} /> Sign In with Microsoft
              </GlowButton>
            </>
          )}
        </GlassCard>

        <GlassCard>
          <div className="flex items-center gap-2 mb-2">
            <Monitor size={16} style={{ color: themeColors.purple }} />
            <h3 className="tinycaps text-sm font-semibold" style={{ color: themeColors.text_main }}>Ely.by</h3>
          </div>
          <p className="text-xs mb-3" style={{ color: themeColors.text_muted }}>Sign in with Ely.by for custom capes and skins</p>
          {elyStep === "polling" && elyAuthUrl ? (
            <div className="space-y-2">
              <a href={elyAuthUrl} target="_blank" rel="noreferrer" className="text-xs flex items-center gap-1" style={{ color: themeColors.accent }}>
                <ExternalLink size={12} /> Open Ely.by login
              </a>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 rounded-full animate-spin" style={{ borderColor: themeColors.purple, borderTopColor: "transparent" }} />
                <span className="text-xs" style={{ color: themeColors.text_muted }}>Waiting for authentication...</span>
              </div>
            </div>
          ) : elyStep === "done" ? (
            <div className="flex items-center gap-2 text-sm" style={{ color: themeColors.success }}>
              <Check size={14} /> Successfully signed in!
            </div>
          ) : (
            <>
              {elyError && (
                <div className="flex items-center gap-1 text-xs mb-2" style={{ color: themeColors.danger }}>
                  <AlertCircle size={12} /> {elyError}
                </div>
              )}
              <GlowButton size="sm" onClick={startElybyAuth} className="w-full flex items-center justify-center gap-1" style={{ background: themeColors.purple }}>
                <Monitor size={14} /> Sign In with Ely.by
              </GlowButton>
            </>
          )}
        </GlassCard>

        <GlassCard>
          <div className="flex items-center gap-2 mb-2">
            <Users size={16} style={{ color: themeColors.warn }} />
            <h3 className="tinycaps text-sm font-semibold" style={{ color: themeColors.text_main }}>Offline</h3>
          </div>
          <p className="text-xs mb-3" style={{ color: themeColors.text_muted }}>Play offline without authentication</p>
          <div className="space-y-2">
            <GlassInput value={offlineUsername} onChange={setOfflineUsername}
              placeholder="Username" onKeyDown={(e) => e.key === "Enter" && addOfflineAccount()} />
            <GlowButton size="sm" onClick={addOfflineAccount} className="w-full flex items-center justify-center gap-1"
              disabled={!offlineUsername.trim()} style={{ background: themeColors.warn }}>
              <Plus size={14} /> Add Offline Account
            </GlowButton>
          </div>
        </GlassCard>
      </div>

      <GlassCard>
        <h3 className="tinycaps text-sm font-semibold mb-3" style={{ color: themeColors.text_main }}>Your Accounts</h3>
        {accounts.length === 0 ? (
          <p className="text-xs py-4 text-center" style={{ color: themeColors.text_muted }}>No accounts added yet. Use the options above to add one.</p>
        ) : (
          <div className="space-y-2">
            {accounts.map((acc) => {
              const isActive = acc.uuid === activeUuid;
              const typeColor = acc.type === "microsoft" ? themeColors.accent : acc.type === "elyby" ? themeColors.purple : themeColors.warn;
              return (
                <div key={acc.uuid} className="flex items-center justify-between px-3 py-2 rounded-lg transition-all"
                  style={{
                    border: `1px solid ${isActive ? typeColor : themeColors.border}`,
                    background: isActive ? `${typeColor}10` : "transparent",
                  }}>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
                      style={{ background: `${typeColor}20`, color: typeColor }}>
                      {acc.username[0].toUpperCase()}
                    </div>
                    <div>
                      <div className="text-sm font-medium" style={{ color: themeColors.text_main }}>{acc.username}</div>
                      <div className="text-[10px] flex items-center gap-1" style={{ color: themeColors.text_muted }}>
                        <span className="px-1 rounded" style={{ background: `${typeColor}15`, color: typeColor }}>{acc.type}</span>
                        {isActive && <span style={{ color: themeColors.accent }}>· Active</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {!isActive && (
                      <GlowButton size="sm" onClick={() => setActive(acc.uuid)} className="text-xs">Set Active</GlowButton>
                    )}
                    <button onClick={() => removeAccount(acc.uuid)} className="p-1.5 rounded-lg transition-colors"
                      style={{ color: themeColors.danger, opacity: 0.6 }}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </GlassCard>
    </div>
  );
}
