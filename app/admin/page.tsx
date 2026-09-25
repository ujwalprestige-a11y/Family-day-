"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Brand } from "@/components/Brand";
import type { AdminRow, AdminTiles, Status } from "@/lib/types";

type Filter = "checked_in" | "not_arrived" | "walk_in" | "over" | "review" | "all";

const TABS: { key: Filter; label: string }[] = [
  { key: "checked_in", label: "Checked in" },
  { key: "not_arrived", label: "Not yet arrived" },
  { key: "walk_in", label: "Walk-ins" },
  { key: "over", label: "Over allotment" },
  { key: "review", label: "Needs review" },
  { key: "all", label: "All" },
];

function statusLabel(s: Status): string {
  return s === "checked_in" ? "Checked in" : "Not yet arrived";
}

function timeLabel(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

function isOver(r: AdminRow): boolean {
  return r.actual_adults > r.allotted_adults || r.actual_children > r.allotted_children;
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
  const [filter, setFilter] = useState<Filter>("checked_in");
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
    if (filter === "checked_in" && r.status !== "checked_in") return false;
    if (filter === "not_arrived" && r.status !== "not_arrived") return false;
    if (filter === "walk_in" && r.source !== "walk_in") return false;
    if (filter === "over" && !isOver(r)) return false;
    if (filter === "review" && !r.needs_review) return false;

    if (!q) return true;
    return (
      r.employee_id.toLowerCase().startsWith(q) ||
      r.full_name.toLowerCase().includes(q) ||
      r.entity.toLowerCase().includes(q) ||
      r.department.toLowerCase().includes(q)
    );
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
              <h2>Admin: check-ins</h2>
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
              <b>{tiles?.checked_in ?? 0}</b>
              <span>Checked in</span>
            </div>
            <div className="stat">
              <b>{tiles?.not_yet_arrived ?? 0}</b>
              <span>Not yet arrived</span>
            </div>
            <div className="stat hl">
              <b>{tiles?.walk_ins ?? 0}</b>
              <span>Walk-ins added</span>
            </div>
            <div className="stat">
              <b>{tiles?.allotted_total ?? 0}</b>
              <span>
                Allotted ({tiles?.allotted_adults ?? 0} adults + {tiles?.allotted_children ?? 0}{" "}
                children)
              </span>
            </div>
            <div className="stat hl">
              <b>{tiles?.actual_total ?? 0}</b>
              <span>
                Issued ({tiles?.actual_adults ?? 0} adults + {tiles?.actual_children ?? 0}{" "}
                children)
              </span>
            </div>
            <div className="stat">
              <b>{tiles?.over_allotment ?? 0}</b>
              <span>Over their allotment</span>
            </div>
          </div>

          <div className="toolbar">
            <input
              type="text"
              placeholder="Filter by ID, name, entity or department"
              aria-label="Filter by ID, name, entity or department"
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
                  <th>Entity</th>
                  <th>Department</th>
                  <th className="num">Allot. A</th>
                  <th className="num">Allot. C</th>
                  <th className="num">Issued A</th>
                  <th className="num">Issued C</th>
                  <th className="num">Diff</th>
                  <th>Status</th>
                  <th>Time</th>
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
                  visible.map((r) => {
                    const allotted = r.allotted_adults + r.allotted_children;
                    const actual = r.actual_adults + r.actual_children;
                    const diff = actual - allotted;
                    return (
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
                        <td>{r.entity || "-"}</td>
                        <td>{r.department || "-"}</td>
                        <td className="num">{r.allotted_adults}</td>
                        <td className="num">{r.allotted_children}</td>
                        <td className="num">{r.status === "checked_in" ? r.actual_adults : "-"}</td>
                        <td className="num">
                          {r.status === "checked_in" ? r.actual_children : "-"}
                        </td>
                        <td className="num">
                          {r.status === "checked_in" ? (diff > 0 ? `+${diff}` : diff) : "-"}
                        </td>
                        <td>
                          <span className={`st ${r.status}`}>{statusLabel(r.status)}</span>
                          {r.source === "walk_in" && (
                            <>
                              {" "}
                              <span className="st walk_in">Walk-in</span>
                            </>
                          )}
                          {r.status === "checked_in" && isOver(r) && (
                            <>
                              {" "}
                              <span className="st over">Over</span>
                            </>
                          )}
                        </td>
                        <td>{timeLabel(r.registered_at)}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          <p className="note">
            Showing {visible.length} of {rows.length} records. The Excel file has three sheets:
            Checked in, Not yet arrived, and Summary.
          </p>
        </div>
      </section>
    </main>
  );
}
