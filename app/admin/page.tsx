"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Brand } from "@/components/Brand";
import { formatINR } from "@/lib/wristbands";
import type { AdminRow, AdminTiles, Status } from "@/lib/types";

type Filter = "registered" | "pre_registered" | "walk_in" | "not_registered" | "all";

const TABS: { key: Filter; label: string }[] = [
  { key: "registered", label: "Registered" },
  { key: "pre_registered", label: "Pre-registered" },
  { key: "walk_in", label: "Walk-ins" },
  { key: "not_registered", label: "Not yet arrived" },
  { key: "all", label: "All" },
];

function statusLabel(s: Status): string {
  return s === "pre_registered" ? "Pre-registered" : s === "walk_in" ? "Walk-in" : "Not yet arrived";
}

function timeLabel(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

export default function AdminPage() {
  const router = useRouter();
  const [authed, setAuthed] = useState(false);
  const [checking, setChecking] = useState(true);

  // PIN gate
  const [pin, setPin] = useState("");
  const [pinErr, setPinErr] = useState("");
  const [signingIn, setSigningIn] = useState(false);

  // dashboard
  const [tiles, setTiles] = useState<AdminTiles | null>(null);
  const [rows, setRows] = useState<AdminRow[]>([]);
  const [filter, setFilter] = useState<Filter>("registered");
  const [text, setText] = useState("");
  const [xlsMsg, setXlsMsg] = useState<{ text: string; bad?: boolean }>({ text: "" });

  const load = useCallback(async (): Promise<boolean> => {
    const res = await fetch("/api/admin/stats", { cache: "no-store" });
    if (res.status === 401) {
      setAuthed(false);
      return false;
    }
    const data = await res.json();
    setTiles(data.tiles);
    setRows(data.rows);
    setAuthed(true);
    return true;
  }, []);

  // On mount, try to load (existing session) then stop the initial spinner.
  useEffect(() => {
    load().finally(() => setChecking(false));
  }, [load]);

  // Auto-refresh every 10s while authed.
  const refreshRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (!authed) return;
    refreshRef.current = setInterval(() => {
      load();
    }, 10_000);
    return () => {
      if (refreshRef.current) clearInterval(refreshRef.current);
    };
  }, [authed, load]);

  async function signIn() {
    setPinErr("");
    setSigningIn(true);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      if (res.status === 429) {
        setPinErr("Too many attempts. Please wait and try again.");
        return;
      }
      if (!res.ok) {
        setPinErr("That PIN is not correct.");
        return;
      }
      setPin("");
      await load();
    } finally {
      setSigningIn(false);
    }
  }

  async function signOut() {
    await fetch("/api/admin/logout", { method: "POST" });
    setAuthed(false);
    setTiles(null);
    setRows([]);
    router.push("/");
  }

  function downloadExcel() {
    setXlsMsg({ text: "Preparing Excel…" });
    // The endpoint streams the file with a Content-Disposition attachment.
    window.location.href = "/api/admin/export.xlsx";
    setTimeout(() => setXlsMsg({ text: "Excel download started." }), 800);
  }

  /* ------------------------- filtering ------------------------- */
  const q = text.trim().toLowerCase();
  const visible = rows.filter((r) => {
    if (filter === "registered" && r.status === "not_registered") return false;
    if (filter !== "registered" && filter !== "all" && r.status !== filter) return false;
    if (!q) return true;
    return r.employee_id.toLowerCase().startsWith(q) || r.full_name.toLowerCase().includes(q);
  });

  /* ------------------------- render ------------------------- */
  if (checking) {
    return (
      <main>
        <Brand compact />
        <section className="card">
          <p className="sub" style={{ margin: 0 }}>
            Loading…
          </p>
        </section>
      </main>
    );
  }

  if (!authed) {
    return (
      <main>
        <Brand compact />
        <section
          className="screen card"
          style={{ maxWidth: 460, margin: "0 auto", width: "100%" }}
          aria-labelledby="h-pin"
        >
          <h2 id="h-pin">Admin sign-in</h2>
          <p className="sub">For registration desk staff only.</p>
          <div className="field">
            <label htmlFor="pin">Admin PIN</label>
            <input
              id="pin"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              maxLength={8}
              className={pinErr ? "bad" : ""}
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && signIn()}
              autoFocus
            />
            <div className="err">{pinErr}</div>
          </div>
          <div className="actions">
            <button className="btn" onClick={signIn} disabled={signingIn}>
              {signingIn ? "Signing in…" : "Sign in"}
            </button>
            <button className="btn ghost" onClick={() => router.push("/")}>
              Back to desk
            </button>
          </div>
          <p className="hint" style={{ marginTop: 14 }}>
            The PIN is read from the ADMIN_PIN setting.
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="wide">
      <Brand compact />
      <section className="screen">
        <div className="card">
          <div className="admin-top">
            <div>
              <h2>Admin: registrations</h2>
              <p className="sub" style={{ margin: 0 }}>
                Live counts and the full list. Export to Excel any time.
              </p>
            </div>
            <div className="actions" style={{ margin: 0 }}>
              <button className="btn" onClick={downloadExcel}>
                Download Excel
              </button>
              <button className="btn ghost" onClick={signOut}>
                Sign out
              </button>
            </div>
          </div>

          <div className={`msg${xlsMsg.bad ? " bad" : ""}`} role="status">
            {xlsMsg.text}
          </div>

          <div className="stats">
            <div className="stat">
              <b>{tiles?.in_master ?? 0}</b>
              <span>In master list</span>
            </div>
            <div className="stat hl">
              <b>{tiles?.pre_registered ?? 0}</b>
              <span>Pre-registered</span>
            </div>
            <div className="stat hl">
              <b>{tiles?.walk_ins ?? 0}</b>
              <span>Walk-ins</span>
            </div>
            <div className="stat">
              <b>{tiles?.not_yet_arrived ?? 0}</b>
              <span>Not yet arrived</span>
            </div>
            <div className="stat">
              <b>{tiles?.wristbands_issued ?? 0}</b>
              <span>Wristbands issued</span>
            </div>
            <div className="stat">
              <b>{formatINR(tiles?.amount_to_collect ?? 0)}</b>
              <span>Paid extended, to collect</span>
            </div>
          </div>

          <div className="toolbar">
            <input
              type="text"
              placeholder="Filter by ID or name"
              aria-label="Filter by ID or name"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <div className="tabs">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  className="tab"
                  aria-pressed={filter === t.key}
                  onClick={() => setFilter(t.key)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Employee ID</th>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Mobile</th>
                  <th>Marital</th>
                  <th>Family</th>
                  <th>Paid extended</th>
                  <th className="num">Wristbands</th>
                  <th>Status</th>
                  <th>Time</th>
                  <th>Edited</th>
                </tr>
              </thead>
              <tbody>
                {visible.length === 0 ? (
                  <tr>
                    <td colSpan={11} style={{ color: "var(--muted)", padding: 22 }}>
                      No records match this filter.
                    </td>
                  </tr>
                ) : (
                  visible.map((r) => (
                    <tr key={r.id}>
                      <td>{r.employee_id}</td>
                      <td>
                        {r.full_name}
                        {r.needs_review && (
                          <span className="review-flag" title="Needs review">
                            {" "}
                            ⚠
                          </span>
                        )}
                      </td>
                      <td>{r.email}</td>
                      <td>{r.mobile}</td>
                      <td>{r.marital_status}</td>
                      <td>{r.family_members.join(", ") || "-"}</td>
                      <td>{r.paid_extended.join(", ") || "-"}</td>
                      <td className="num">{r.wristbands_total}</td>
                      <td>
                        <span className={`st ${r.status}`}>{statusLabel(r.status)}</span>
                      </td>
                      <td>{timeLabel(r.registered_at)}</td>
                      <td>{r.edited_fields.join(", ") || "-"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <p className="note">
            The Excel file has three sheets: Registrations, Not yet arrived, and Summary.
          </p>
        </div>
      </section>
    </main>
  );
}
