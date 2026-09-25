"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Brand } from "@/components/Brand";
import { CheckTick } from "@/components/CheckTick";
import { LoadingOverlay } from "@/components/LoadingOverlay";
import { AllotmentCounter } from "@/components/AllotmentCounter";
import { MAX_ADULTS, MAX_CHILDREN, clampCount } from "@/lib/allotment";
import { isNonEmptyName, isValidEmployeeId } from "@/lib/validation";
import type { EmployeeFull, SearchResult } from "@/lib/types";

type Screen = "search" | "confirm" | "welcome" | "walkin";

const AUTO_RETURN_MS = 8000;
const MIN_QUERY = 3;

function timeLabel(iso: string | null): string {
  if (!iso) return "earlier";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "earlier";
  return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

/** "PEPL Bangalore · Engg-Project Management", skipping blanks. */
function orgLine(entity: string, department: string): string {
  return [entity, department].filter((s) => s && s.trim() !== "").join(" · ");
}

export default function KioskPage() {
  const router = useRouter();
  const [screen, setScreen] = useState<Screen>("search");
  const [busy, setBusy] = useState<string | null>(null);

  // search
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [noMatch, setNoMatch] = useState(false);
  const searchInput = useRef<HTMLInputElement>(null);

  // confirm
  const [current, setCurrent] = useState<EmployeeFull | null>(null);
  const [adults, setAdults] = useState(0);
  const [children, setChildren] = useState(0);
  const [cErr, setCErr] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // welcome
  const [shown, setShown] = useState<EmployeeFull | null>(null);
  const [wasUpdate, setWasUpdate] = useState(false);

  // walk-in
  const [wId, setWId] = useState("");
  const [wName, setWName] = useState("");
  const [wEntity, setWEntity] = useState("");
  const [wDept, setWDept] = useState("");
  const [wAdults, setWAdults] = useState(1);
  const [wChildren, setWChildren] = useState(0);
  const [wErr, setWErr] = useState<Record<string, string>>({});
  const [wSubmitting, setWSubmitting] = useState(false);

  /* ----------------------------- search ----------------------------- */
  useEffect(() => {
    const query = q.trim();
    if (query.length < MIN_QUERY) {
      setResults([]);
      setNoMatch(false);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`, {
          signal: ctrl.signal,
        });
        const data = await res.json();
        const hits: SearchResult[] = data.results ?? [];
        setResults(hits);
        setNoMatch(hits.length === 0);
      } catch {
        /* aborted or network error — ignore */
      }
    }, 220);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  const reset = useCallback(() => {
    setQ("");
    setResults([]);
    setNoMatch(false);
    setCurrent(null);
    setShown(null);
    setWasUpdate(false);
    setCErr("");
    setScreen("search");
  }, []);

  /* --------------------------- selection ---------------------------- */
  async function pick(r: SearchResult) {
    setBusy("Loading details…");
    try {
      const res = await fetch(`/api/employee/${encodeURIComponent(r.id)}`);
      if (!res.ok) return;
      const { employee } = (await res.json()) as { employee: EmployeeFull };
      openConfirm(employee);
    } finally {
      setBusy(null);
    }
  }

  /**
   * Pre-fill the counters with the allotment so the common case is a single tap.
   * If they have already checked in, pre-fill with what was actually issued so
   * staff can correct it rather than start from scratch.
   */
  function openConfirm(emp: EmployeeFull) {
    setCurrent(emp);
    const checkedIn = emp.status === "checked_in";
    setAdults(checkedIn ? emp.actual_adults : emp.allotted_adults);
    setChildren(checkedIn ? emp.actual_children : emp.allotted_children);
    setCErr("");
    setScreen("confirm");
  }

  async function confirmCheckIn() {
    if (!current) return;

    if (adults + children === 0) {
      setCErr("Add at least one wristband before confirming.");
      return;
    }

    setSubmitting(true);
    setBusy("Checking in…");
    try {
      const res = await fetch(`/api/register/${encodeURIComponent(current.id)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actual_adults: adults, actual_children: children }),
      });

      if (res.status === 422) {
        const { errors } = await res.json();
        setCErr(errors?.actual_adults ?? errors?.actual_children ?? "Please check the counts.");
        return;
      }
      if (!res.ok) {
        setCErr("Could not check in. Please try again.");
        return;
      }

      const data = (await res.json()) as { result: string; employee: EmployeeFull };
      setShown(data.employee);
      setWasUpdate(data.result === "updated");
      setScreen("welcome");
    } catch {
      setCErr("Could not reach the server. Please try again.");
    } finally {
      setSubmitting(false);
      setBusy(null);
    }
  }

  /* ---------------------------- walk-in ----------------------------- */
  function openWalkin(prefill: string) {
    const p = prefill.trim();
    const looksNumeric = /^\d+$/.test(p);
    setWId(looksNumeric ? p : "");
    setWName(looksNumeric || !p ? "" : p);
    setWEntity("");
    setWDept("");
    setWAdults(1);
    setWChildren(0);
    setWErr({});
    setScreen("walkin");
  }

  async function submitWalkin() {
    const errs: Record<string, string> = {};
    if (!wId.trim()) errs.employee_id = "Enter the employee ID.";
    else if (!isValidEmployeeId(wId)) errs.employee_id = "Employee ID must be exactly 6 digits.";
    if (!isNonEmptyName(wName)) errs.full_name = "Enter the full name.";
    if (wAdults + wChildren === 0) errs.actual_adults = "Add at least one wristband.";
    setWErr(errs);
    if (Object.keys(errs).length > 0) return;

    setWSubmitting(true);
    setBusy("Adding guest…");
    try {
      const res = await fetch("/api/walkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employee_id: wId.trim(),
          full_name: wName.trim(),
          entity: wEntity.trim(),
          department: wDept.trim(),
          actual_adults: wAdults,
          actual_children: wChildren,
        }),
      });

      if (res.status === 409) {
        const { message } = await res.json();
        setWErr({
          employee_id: message ?? "This ID is already in the list. Please search instead.",
        });
        return;
      }
      if (res.status === 422) {
        const { errors } = await res.json();
        setWErr(errors ?? {});
        return;
      }
      if (!res.ok) {
        setWErr({ full_name: "Could not add this guest. Please try again." });
        return;
      }

      const data = (await res.json()) as { employee: EmployeeFull };
      setShown(data.employee);
      setWasUpdate(false);
      setScreen("welcome");
    } catch {
      setWErr({ full_name: "Could not reach the server. Please try again." });
    } finally {
      setWSubmitting(false);
      setBusy(null);
    }
  }

  /* ---------------------------- lock device -------------------------- */
  // Clears the app-gate cookie so the next person has to sign in again.
  async function lockDevice() {
    setBusy("Signing out…");
    try {
      await fetch("/api/logout", { method: "POST" });
    } finally {
      router.replace("/login");
      router.refresh();
    }
  }

  /* ------------------------ welcome countdown ----------------------- */
  useEffect(() => {
    if (screen !== "welcome") return;
    const t = setTimeout(reset, AUTO_RETURN_MS);
    return () => clearTimeout(t);
  }, [screen, reset]);

  /* ------------------------------ view ------------------------------ */
  const issuedTotal = adults + children;
  const overAllotment =
    current !== null &&
    (adults > current.allotted_adults || children > current.allotted_children);

  return (
    <main>
      {busy && <LoadingOverlay message={busy} />}
      <Brand compact={screen !== "search"} />

      {/* 1. SEARCH */}
      {screen === "search" && (
        <section className="screen card" aria-labelledby="h-search">
          <h2 id="h-search">Find the guest</h2>
          <p className="sub">
            Type at least {MIN_QUERY} characters of the employee ID or name.
          </p>
          <div className="searchwrap">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" strokeLinecap="round" />
            </svg>
            <input
              ref={searchInput}
              type="text"
              inputMode="search"
              autoComplete="off"
              placeholder="e.g. 220477 or Umesh"
              aria-label="Employee ID or name"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>

          <ul className="results" role="list">
            {results.map((r) => (
              <li key={r.id}>
                <button type="button" onClick={() => pick(r)}>
                  <span>
                    <span className="r-name">
                      {r.full_name}
                      <span className="r-idinline"> ({r.employee_id})</span>
                    </span>
                    {r.status === "checked_in" && <span className="tag">Checked in</span>}
                    <br />
                    <span className="r-meta">
                      {r.allotted_adults} adult{r.allotted_adults === 1 ? "" : "s"} ·{" "}
                      {r.allotted_children} child{r.allotted_children === 1 ? "" : "ren"}
                      {orgLine(r.entity, r.department) && ` · ${orgLine(r.entity, r.department)}`}
                    </span>
                  </span>
                  <span className="r-id">{r.employee_id}</span>
                </button>
              </li>
            ))}
          </ul>

          {noMatch && (
            <div className="empty">
              <b>No match for “{q.trim()}”.</b>
              <br />
              Check the spelling, or add them as a new guest.
            </div>
          )}

          <div className="center" style={{ marginTop: 14 }}>
            <button className="link" onClick={() => openWalkin(q)}>
              Not on the list? Add as a new guest
            </button>
          </div>
        </section>
      )}

      {/* 2. CONFIRM / CHECK IN */}
      {screen === "confirm" && current && (
        <section className="screen card" aria-labelledby="h-confirm">
          <h2 id="h-confirm">{current.full_name}</h2>
          <p className="sub">
            Employee ID {current.employee_id}
            {orgLine(current.entity, current.department) && (
              <>
                <br />
                <span className="orgline">{orgLine(current.entity, current.department)}</span>
              </>
            )}
          </p>

          {current.status === "checked_in" && (
            <div className="banner">
              Already checked in at {timeLabel(current.registered_at)}. You can correct the
              numbers below and confirm again.
            </div>
          )}

          {current.needs_review && (
            <div className="banner">
              This record was flagged during import — please confirm the employee ID against
              their card.
            </div>
          )}

          <div className="allotline">
            <span>
              Opted for: <b>{current.allotted_adults}</b> adult
              {current.allotted_adults === 1 ? "" : "s"}
            </span>
            <span>
              <b>{current.allotted_children}</b> child
              {current.allotted_children === 1 ? "" : "ren"}
            </span>
            <span>
              Total <b>{current.allotted_adults + current.allotted_children}</b>
            </span>
          </div>

          <span className="lbl">Wristbands to issue now</span>
          <AllotmentCounter
            allottedAdults={current.allotted_adults}
            allottedChildren={current.allotted_children}
            adults={adults}
            children={children}
            onAdultsChange={setAdults}
            onChildrenChange={setChildren}
          />

          {overAllotment && (
            <div className="banner">
              This is more than they opted for. It will be recorded as over allotment.
            </div>
          )}

          <div className="pills">
            <span className="pill gold">
              Issuing {issuedTotal} wristband{issuedTotal === 1 ? "" : "s"}
            </span>
          </div>

          <div className="err" role="alert">
            {cErr}
          </div>

          <div className="actions">
            <button className="btn" onClick={confirmCheckIn} disabled={submitting}>
              {submitting ? "Confirming…" : "Confirm check-in"}
            </button>
            <button className="btn ghost" onClick={reset}>
              Back to search
            </button>
          </div>
        </section>
      )}

      {/* 3. WELCOME */}
      {screen === "welcome" && shown && (
        <section className="screen card center" aria-labelledby="h-welcome">
          <CheckTick />
          <h2 id="h-welcome">
            {wasUpdate ? "Updated" : "Welcome"}, {shown.full_name.split(" ")[0]}!
          </h2>
          <p className="sub">
            {wasUpdate
              ? "The wristband count has been corrected."
              : "Checked in. Please collect the wristbands."}
          </p>

          <div className="pills">
            <span className="pill gold">
              {shown.actual_adults} adult{shown.actual_adults === 1 ? "" : "s"}
            </span>
            <span className="pill gold">
              {shown.actual_children} child{shown.actual_children === 1 ? "" : "ren"}
            </span>
            <span className="pill">
              {shown.actual_adults + shown.actual_children} total
            </span>
          </div>

          <div className="actions">
            <button className="btn" onClick={reset}>
              Next guest
            </button>
          </div>
        </section>
      )}

      {/* 4. WALK-IN */}
      {screen === "walkin" && (
        <section className="screen card" aria-labelledby="h-walkin">
          <h2 id="h-walkin">Add a new guest</h2>
          <p className="sub">
            For someone who is not in the list. They have no allotment, so everything issued
            is recorded as extra.
          </p>

          <div className="row">
            <div className="field">
              <label htmlFor="w-id">Employee ID</label>
              <input
                id="w-id"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                className={wErr.employee_id ? "bad" : ""}
                value={wId}
                onChange={(e) => setWId(e.target.value.replace(/\D/g, "").slice(0, 6))}
              />
              <div className="err">{wErr.employee_id}</div>
            </div>

            <div className="field">
              <label htmlFor="w-name">Full name</label>
              <input
                id="w-name"
                type="text"
                autoComplete="off"
                className={wErr.full_name ? "bad" : ""}
                value={wName}
                onChange={(e) => setWName(e.target.value)}
              />
              <div className="err">{wErr.full_name}</div>
            </div>
          </div>

          <div className="row">
            <div className="field">
              <label htmlFor="w-entity">Entity (optional)</label>
              <input
                id="w-entity"
                type="text"
                autoComplete="off"
                value={wEntity}
                onChange={(e) => setWEntity(e.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="w-dept">Department (optional)</label>
              <input
                id="w-dept"
                type="text"
                autoComplete="off"
                value={wDept}
                onChange={(e) => setWDept(e.target.value)}
              />
            </div>
          </div>

          <span className="lbl">Wristbands to issue</span>
          <AllotmentCounter
            allottedAdults={0}
            allottedChildren={0}
            adults={wAdults}
            children={wChildren}
            onAdultsChange={(n) => setWAdults(clampCount(n, MAX_ADULTS))}
            onChildrenChange={(n) => setWChildren(clampCount(n, MAX_CHILDREN))}
          />

          <div className="err" role="alert">
            {wErr.actual_adults}
          </div>

          <div className="actions">
            <button className="btn" onClick={submitWalkin} disabled={wSubmitting}>
              {wSubmitting ? "Adding…" : "Add and check in"}
            </button>
            <button className="btn ghost" onClick={reset}>
              Back to search
            </button>
          </div>
        </section>
      )}

      <div className="footbar foot">
        <div>Registration desk · Beyond the Skyline</div>
        <Link href="/admin" className="foot" style={{ color: "var(--muted)" }}>
          Staff sign-in
        </Link>
        <button type="button" onClick={lockDevice} style={{ color: "var(--muted)" }}>
          Lock this device
        </button>
      </div>
    </main>
  );
}
