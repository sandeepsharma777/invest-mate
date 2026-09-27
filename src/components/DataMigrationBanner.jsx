import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { checkLocalStorageDataToMigrate, migrateLocalStorageToSupabase } from "../lib/db";

export default function DataMigrationBanner({ onMigrationComplete }) {
  const { user } = useAuth();
  const toast = useToast();
  const [migrationInfo, setMigrationInfo] = useState(null);
  const [migrating, setMigrating] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (user?.uid && !dismissed) {
      const info = checkLocalStorageDataToMigrate(user.uid);
      setMigrationInfo(info);
    }
  }, [user?.uid, dismissed]);

  if (!migrationInfo || dismissed) return null;

  async function handleMigrate() {
    setMigrating(true);
    try {
      const res = await migrateLocalStorageToSupabase(user.uid);
      if (res.migrated) {
        toast(
          `Successfully migrated ${res.importedHoldings} holdings, ${res.importedGoals} goals, and ${res.importedAlerts} alerts to Supabase!`,
          "success"
        );
        setMigrationInfo(null);
        if (onMigrationComplete) onMigrationComplete();
      } else {
        toast("No data found to migrate.", "info");
      }
    } catch (err) {
      toast(`Migration error: ${err.message}`, "error");
    } finally {
      setMigrating(false);
    }
  }

  function handleDismiss() {
    if (user?.uid) {
      localStorage.setItem(`investmate_migrated_supabase_${user.uid}`, "true");
    }
    setDismissed(true);
  }

  return (
    <div
      style={{
        margin: "0 0 var(--sp-4) 0",
        padding: "12px 16px",
        borderRadius: "var(--radius-md)",
        background: "#fffdfa",
        border: "1px solid var(--gold-500)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: 12,
        boxShadow: "0 2px 8px rgba(201,162,75,0.12)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: "50%",
            background: "var(--gold-100)",
            color: "var(--gold-700)",
            display: "grid",
            placeItems: "center",
            fontSize: 16,
            flexShrink: 0,
          }}
        >
          📦
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: "var(--fs-sm)", color: "var(--paper-ink)" }}>
            Local Portfolio Data Found
          </div>
          <div style={{ fontSize: "var(--fs-xs)", color: "var(--paper-ink-soft)" }}>
            Found {migrationInfo.holdingsCount} holding(s), {migrationInfo.goalsCount} goal(s), and {migrationInfo.alertsCount} alert(s) in your browser. Migrate them to your Supabase Cloud Database!
          </div>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button
          type="button"
          className="btn btn--sm btn--ghost-paper"
          onClick={handleDismiss}
          disabled={migrating}
          style={{ fontSize: 11 }}
        >
          Dismiss
        </button>
        <button
          type="button"
          className="btn btn--sm btn--primary"
          onClick={handleMigrate}
          disabled={migrating}
          style={{ fontSize: 11 }}
        >
          {migrating ? "Migrating to Cloud..." : "Import to Supabase"}
        </button>
      </div>
    </div>
  );
}
