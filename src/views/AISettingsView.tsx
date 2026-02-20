import { useState, useEffect } from "react";
import { useAIStore } from "@/stores/ai-store";
import { aiConfigure, aiStatus } from "@/lib/tauri";
import {
  ANTHROPIC_MODELS,
  OPENAI_MODELS,
  DEFAULT_ANTHROPIC_MODEL,
  DEFAULT_OPENAI_MODEL,
} from "@/lib/models";
import { Bot, CheckCircle2, ChevronDown } from "lucide-react";

export function AISettingsView() {
  const { configured, setConfigured } = useAIStore();
  const [provider, setProvider] = useState<"anthropic" | "openai">("anthropic");
  const [model, setModel] = useState(DEFAULT_ANTHROPIC_MODEL);
  const [customModel, setCustomModel] = useState("");
  const [isCustomModel, setIsCustomModel] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const models = provider === "anthropic" ? ANTHROPIC_MODELS : OPENAI_MODELS;

  useEffect(() => {
    aiStatus().then(setConfigured).catch(() => {});
  }, [setConfigured]);

  const handleProviderChange = (p: "anthropic" | "openai") => {
    setProvider(p);
    setIsCustomModel(false);
    setCustomModel("");
    setModel(p === "anthropic" ? DEFAULT_ANTHROPIC_MODEL : DEFAULT_OPENAI_MODEL);
    setSuccess(false);
  };

  const handleModelSelect = (value: string) => {
    if (value === "__custom__") {
      setIsCustomModel(true);
      setModel("");
    } else {
      setIsCustomModel(false);
      setCustomModel("");
      setModel(value);
    }
    setSuccess(false);
  };

  const handleSave = async () => {
    const finalModel = isCustomModel ? customModel : model;
    if (!apiKey.trim()) {
      setError("API key is required");
      return;
    }
    if (isCustomModel && !customModel.trim()) {
      setError("Enter a model name");
      return;
    }

    setSaving(true);
    setError("");
    setSuccess(false);
    try {
      await aiConfigure({
        provider,
        api_key: apiKey,
        model: finalModel || undefined,
      });
      setConfigured(true);
      setSuccess(true);
      setApiKey("");
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ height: "100%", overflowY: "auto" }}>
      <div style={{ maxWidth: "640px", margin: "0 auto", padding: "40px 32px" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "32px" }}>
          <div
            style={{
              width: "48px",
              height: "48px",
              borderRadius: "16px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "rgba(62,207,142,0.15)",
            }}
          >
            <Bot size={24} style={{ color: "var(--color-accent)" }} />
          </div>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: "18px", fontWeight: 600, color: "var(--color-text-primary)" }}>
              AI Configuration
            </h1>
            <p style={{ fontSize: "14px", color: "var(--color-text-secondary)", marginTop: "2px" }}>
              Configure your AI provider for autocomplete, chat, and query assistance
            </p>
          </div>
          {configured && (
            <span
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                borderRadius: "999px",
                backgroundColor: "rgba(62,207,142,0.1)",
                padding: "6px 14px",
                fontSize: "12px",
                fontWeight: 500,
                color: "var(--color-accent)",
              }}
            >
              <CheckCircle2 size={12} />
              Active
            </span>
          )}
        </div>

        {/* Config card */}
        <div
          style={{
            border: "1px solid var(--color-border)",
            backgroundColor: "var(--color-bg-secondary)",
            borderRadius: "16px",
            padding: "28px",
          }}
        >
          {/* Provider toggle */}
          <div style={{ marginBottom: "24px" }}>
            <label style={{ display: "block", fontSize: "11px", fontWeight: 500, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "10px" }}>
              Provider
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
              {(["anthropic", "openai"] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => handleProviderChange(p)}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: "6px",
                    borderWidth: "2px",
                    borderStyle: "solid",
                    borderRadius: "12px",
                    padding: "14px 16px",
                    borderColor: provider === p ? "var(--color-accent)" : "var(--color-border)",
                    backgroundColor: provider === p ? "rgba(62,207,142,0.05)" : "transparent",
                    cursor: "pointer",
                    transition: "all 0.15s",
                  }}
                >
                  <span style={{ fontSize: "14px", fontWeight: 600, color: provider === p ? "var(--color-accent)" : "var(--color-text-secondary)" }}>
                    {p === "anthropic" ? "Anthropic" : "OpenAI"}
                  </span>
                  <span style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>
                    {p === "anthropic" ? "Claude models" : "GPT models"}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Model selector */}
          <div style={{ marginBottom: "24px" }}>
            <label style={{ display: "block", fontSize: "11px", fontWeight: 500, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "10px" }}>
              Model
            </label>
            <div style={{ position: "relative" }}>
              <select
                value={isCustomModel ? "__custom__" : model}
                onChange={(e) => handleModelSelect(e.target.value)}
                style={{
                  width: "100%",
                  appearance: "none",
                  borderRadius: "12px",
                  border: "1px solid var(--color-border)",
                  backgroundColor: "var(--color-bg-tertiary)",
                  padding: "10px 40px 10px 14px",
                  fontSize: "14px",
                  color: "var(--color-text-primary)",
                  outline: "none",
                }}
              >
                {models.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
                <option value="__custom__">Other (custom model ID)</option>
              </select>
              <ChevronDown
                size={14}
                style={{ position: "absolute", right: "14px", top: "50%", transform: "translateY(-50%)", color: "var(--color-text-muted)", pointerEvents: "none" }}
              />
            </div>
            {isCustomModel && (
              <input
                value={customModel}
                onChange={(e) => { setCustomModel(e.target.value); setSuccess(false); }}
                placeholder="Enter model ID (e.g. claude-3-opus-20240229)"
                style={{
                  width: "100%",
                  borderRadius: "12px",
                  border: "1px solid var(--color-border)",
                  backgroundColor: "var(--color-bg-tertiary)",
                  padding: "10px 14px",
                  fontSize: "14px",
                  color: "var(--color-text-primary)",
                  outline: "none",
                  marginTop: "8px",
                  boxSizing: "border-box",
                }}
              />
            )}
          </div>

          {/* API Key */}
          <div style={{ marginBottom: "24px" }}>
            <label style={{ display: "block", fontSize: "11px", fontWeight: 500, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "10px" }}>
              API Key
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => { setApiKey(e.target.value); setSuccess(false); setError(""); }}
              placeholder={provider === "anthropic" ? "sk-ant-api03-..." : "sk-proj-..."}
              style={{
                width: "100%",
                borderRadius: "12px",
                border: "1px solid var(--color-border)",
                backgroundColor: "var(--color-bg-tertiary)",
                padding: "10px 14px",
                fontSize: "14px",
                color: "var(--color-text-primary)",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
            <p style={{ fontSize: "12px", color: "var(--color-text-muted)", marginTop: "8px", lineHeight: 1.5 }}>
              Stored locally on your device. Only schema metadata is sent to the AI — never your actual data.
            </p>
          </div>

          {error && <p style={{ fontSize: "12px", color: "var(--color-danger)", marginBottom: "16px" }}>{error}</p>}

          {success && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                borderRadius: "12px",
                backgroundColor: "rgba(62,207,142,0.1)",
                padding: "12px 16px",
                fontSize: "12px",
                color: "var(--color-accent)",
                marginBottom: "16px",
              }}
            >
              <CheckCircle2 size={14} />
              AI provider configured successfully
            </div>
          )}

          {/* Save */}
          <button
            onClick={handleSave}
            disabled={saving || !apiKey.trim()}
            style={{
              width: "100%",
              borderRadius: "12px",
              backgroundColor: (!saving && apiKey.trim()) ? "var(--color-accent)" : "rgba(62,207,142,0.5)",
              padding: "12px 16px",
              fontSize: "14px",
              fontWeight: 500,
              color: "white",
              border: "none",
              cursor: (!saving && apiKey.trim()) ? "pointer" : "default",
            }}
          >
            {saving ? "Saving..." : "Save Configuration"}
          </button>
        </div>
      </div>
    </div>
  );
}
