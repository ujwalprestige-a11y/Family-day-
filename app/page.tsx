"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Brand } from "@/components/Brand";
import { CheckTick } from "@/components/CheckTick";
import { LoadingOverlay } from "@/components/LoadingOverlay";
import { FamilySelector } from "@/components/FamilySelector";
import { wristbandTotal } from "@/lib/wristbands";
import { isValidEmail, isValidMobile, isNonEmptyName, isValidEmployeeId } from "@/lib/validation";
import type { EmployeeFull, SearchResult } from "@/lib/types";

type Screen = "search" | "confirm" | "welcome" | "already" | "walkin";

const AUTO_RETURN_MS = 8000;

export default function KioskPage() {
  const [screen, setScreen] = useState<Screen>("search");
  const [busy, setBusy] = useState<string | null>(null);

  // search
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [noMatch, setNoMatch] = useState(false);
  const searchInput = useRef<HTMLInputElement>(null);

  // confirm
  const [current, setCurrent] = useState<EmployeeFull | null>(null);
  const [cName, setCName] = useState("");
  const [cEmail, setCEmail] = useState("");
  const [cMobile, setCMobile] = useState("");
  const [famSel, setFamSel] = useState<string[]>([]);
  const [paidSel, setPaidSel] = useState<string[]>([]);
  const [cErr, setCErr] = useState<{ name?: string; email?: string; mobile?: string }>({});
  const [submitting, setSubmitting] = useState(false);
  const [reviewBanner, setReviewBanner] = useState(false);

  // welcome / already
  const [shown, setShown] = useState<EmployeeFull | null>(null);

  // walk-in
  const [wId, setWId] = useState("");
  const [wName, setWName] = useState("");
  const [wEmail, setWEmail] = useState("");
  const [wMobile, setWMobile] = useState("");
  const [wMarital, setWMarital] = useState("Single");
  const [wFam, setWFam] = useState<string[]>([]);
  const [wPaid, setWPaid] = useState<string[]>([]);
  const [wErr, setWErr] = useState<Record<string, string>>({});
  const [wSubmitting, setWSubmitting] = useState(false);

  /* ----------------------------- search ----------------------------- */
  useEffect(() => {
    const query = q.trim();
    if (query.length < 4) {
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
    setScreen("search");
  }, []);

  /* --------------------------- selection ---------------------------- */
  async function pick(r: SearchResult) {
    setBusy("Loading your details…");
    try {
      const res = await fetch(`/api/employee/${encodeURIComponent(r.id)}`);
      if (!res.ok) return;
      const { employee } = (await res.json()) as { employee: EmployeeFull };
      if (employee.status !== "not_registered") {
        setShown(employee);
        setCurrent(employee);
        setScreen("already");
      } else {
        openConfirm(employee);
      }
    } finally {
      setBusy(null);
    }
  }

  function openConfirm(emp: EmployeeFull) {
    setCurrent(emp);
    setCName(emp.full_name);
    setCEmail(emp.email);
    setCMobile(emp.mobile);
    setFamSel([...emp.family_members]);
    setPaidSel([...emp.paid_extended]);
    setCErr({});
    setReviewBanner(emp.needs_review || !isValidMobile(emp.mobile));
    setScreen("confirm");
  }

  async function confirmRegistration() {
    if (!current) return;
    const errs: typeof cErr = {};
    if (!isNonEmptyName(cName)) errs.name = "Enter your full name.";
    if (!isValidEmail(cEmail)) errs.email = "Enter a valid email, like name@company.com.";
    if (!isValidMobile(cMobile)) errs.mobile = "Enter a 10-digit mobile number.";
    setCErr(errs);
    if (Object.keys(errs).length > 0) return;

    setSubmitting(true);
    setBusy("Confirming your registration…");
    try {
      const res = await fetch(`/api/register/${encodeURIComponent(current.id)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: cName.trim(),
          email: cEmail.trim(),
          mobile: cMobile.trim(),
          family_members: famSel,
          paid_extended: paidSel,
        }),
      });
      if (res.status === 422) {
        const { errors } = await res.json();
        setCErr({
          name: errors.full_name,
          email: errors.email,
          mobile: errors.mobile,
        });
        return;
      }
      const data = (await res.json()) as { result: string; employee: EmployeeFull };
      setShown(data.employee);
      if (data.result === "already_registered") {
        setCurrent(data.employee);
        setScreen("already");
      } else {
        setScreen("welcome");
      }
    } finally {
      setSubmitting(false);
      setBusy(null);
    }
  }

  /* ---------------------------- walk-in ----------------------------- */
  function openWalkin(prefill: string) {
    const p = prefill.trim();
    setWId(/^\d+$/.test(p) ? p : "");
    setWName(/^\d+$/.test(p) || !p ? "" : p);
    setWEmail("");
    setWMobile("");
    setWMarital("Single");
    setWFam([]);
    setWPaid([]);
    setWErr({});
    setScreen("walkin");
  }

  async function submitWalkin() {
    const errs: Record<string, string> = {};
    if (!wId.trim()) errs.employee_id = "Enter your employee ID.";
    else if (!isValidEmployeeId(wId)) errs.employee_id = "Employee ID must be exactly 6 digits.";
    if (!isNonEmptyName(wName)) errs.full_name = "Enter your full name.";
    if (!isValidEmail(wEmail)) errs.email = "Enter a valid email, like name@company.com.";
    if (!isValidMobile(wMobile)) errs.mobile = "Enter a 10-digit mobile number.";
    setWErr(errs);
    if (Object.keys(errs).length > 0) return;

    setWSubmitting(true);
    setBusy("Registering you…");
    try {
      const res = await fetch("/api/walkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employee_id: wId.trim(),
          full_name: wName.trim(),
          email: wEmail.trim(),
          mobile: wMobile.trim(),
          marital_status: wMarital,
          family_members: wFam,
          paid_extended: wPaid,
        }),
      });
      if (res.status === 409) {
        const { message } = await res.json();
        setWErr({ employee_id: message ?? "This ID is already in the list. Please search instead." });
        return;
      }
      if (res.status === 422) {
        const { errors } = await res.json();
        setWErr({
          employee_id: errors.employee_id,
          full_name: errors.full_name,
          email: errors.email,
          mobile: errors.mobile,
        });
        return;
      }
      const data = (await res.json()) as { employee: EmployeeFull };
      setShown(data.employee);
      setScreen("welcome");
    } finally {
      setWSubmitting(false);
      setBusy(null);
    }
  }

  /* ------------------------ welcome countdown ----------------------- */
  useEffect(() => {
    if (screen !== "welcome") return;
    const t = setTimeout(reset, AUTO_RETURN_MS);
    return () => clearTimeout(t);
  }, [screen, reset]);

  /* ------------------------------ view ------------------------------ */
  const tallyTotal = 1 + famSel.length + paidSel.length;

  return (
    <main>
      {busy && <LoadingOverlay message={busy} />}
      <Brand compact={screen !== "search"} />

      {/* 1. SEARCH */}
      {screen === "search" && (
        <section className="screen card" aria-labelledby="h-search">
          <h2 id="h-search">Find your registration</h2>
          <p className="sub">Type at least 4 characters of your employee ID or name.</p>
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
              placeholder="e.g. 101104 or Kavya"
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
                    {r.status !== "not_registered" && <span className="tag">Registered</span>}
                    <br />
                    <span className="r-meta">
                      {r.marital_status} · {r.mobile}
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
              Check the spelling, or register as a new guest.
            </div>
          )}
          <div className="center" style={{ marginTop: 14 }}>
            <button className="link" onClick={() => openWalkin(q)}>
              Not on the list? Register as a new guest
            </button>
          </div>
        </section>
      )}

      {/* 2. CONFIRM */}
      {screen === "confirm" && current && (
        <section className="screen card" aria-labelledby="h-confirm">
          <h2 id="h-confirm">Check your details</h2>
          <p className="sub">Fix anything that’s wrong, then confirm.</p>
          {reviewBanner && (
            <div className="banner">
              Some details look incomplete. Please check your email and mobile number.
            </div>
          )}
          <div className="row">
            <div className="field">
              <label htmlFor="c-id">Employee ID</label>
              <input id="c-id" type="text" readOnly value={current.employee_id} />
            </div>
            <div className="field">
              <label htmlFor="c-marital">Marital status</label>
              <input id="c-marital" type="text" readOnly value={current.marital_status} />
            </div>
          </div>
          <div className="field">
            <label className="req" htmlFor="c-name">
              Full name
            </label>
            <input
              id="c-name"
              type="text"
              className={cErr.name ? "bad" : ""}
              value={cName}
              onChange={(e) => setCName(e.target.value)}
            />
            <div className="err">{cErr.name}</div>
          </div>
          <div className="row">
            <div className="field">
              <label className="req" htmlFor="c-email">
                Email
              </label>
              <input
                id="c-email"
                type="email"
                inputMode="email"
                className={cErr.email ? "bad" : ""}
                value={cEmail}
                onChange={(e) => setCEmail(e.target.value)}
              />
              <div className="err">{cErr.email}</div>
            </div>
            <div className="field">
              <label className="req" htmlFor="c-mobile">
                Mobile number
              </label>
              <input
                id="c-mobile"
                type="tel"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={10}
                className={cErr.mobile ? "bad" : ""}
                value={cMobile}
                onChange={(e) => setCMobile(e.target.value.replace(/\D/g, "").slice(0, 10))}
              />
              <div className="err">{cErr.mobile}</div>
            </div>
          </div>
          <FamilySelector
            maritalStatus={current.marital_status}
            family={famSel}
            onFamilyChange={setFamSel}
            paid={paidSel}
            onPaidChange={setPaidSel}
          />
          <div className="tally">
            <div>
              <small>Total wristbands, including you</small>
              <b>{tallyTotal}</b>
            </div>
          </div>
          <div className="actions">
            <button className="btn" onClick={confirmRegistration} disabled={submitting}>
              {submitting ? "Confirming…" : "Confirm registration"}
            </button>
            <button className="btn ghost" onClick={reset}>
              Back to search
            </button>
          </div>
        </section>
      )}

      {/* 3. WELCOME */}
      {screen === "welcome" && shown && (
        <section className="screen card welcome" aria-live="polite">
          <CheckTick />
          <h1>WELCOME TO FAMILY DAY</h1>
          <div className="who">{shown.full_name.split(" ")[0]}</div>
          <p>Employee ID {shown.employee_id} is now registered.</p>
          <Pills emp={shown} />
          <div className="countdown" aria-hidden="true">
            <i />
          </div>
          <button className="btn" onClick={reset}>
            Next guest
          </button>
        </section>
      )}

      {/* 4. ALREADY */}
      {screen === "already" && shown && (
        <section className="screen card welcome">
          <CheckTick animate={false} />
          <h1>YOU’RE ALREADY REGISTERED</h1>
          <div className="who">{shown.full_name}</div>
          <p>
            Checked in at {formatTime(shown.registered_at)}. Nothing more to do.
          </p>
          <Pills emp={shown} />
          <div className="actions" style={{ justifyContent: "center" }}>
            <button className="btn" onClick={reset}>
              Next guest
            </button>
            <button className="btn ghost" onClick={() => shown && openConfirm(shown)}>
              Update my details
            </button>
          </div>
        </section>
      )}

      {/* 5. WALK-IN */}
      {screen === "walkin" && (
        <section className="screen card" aria-labelledby="h-walk">
          <h2 id="h-walk">New guest registration</h2>
          <p className="sub">
            We couldn’t find you in the list. Fill in the four required fields to register.
          </p>
          <div className="field">
            <label className="req" htmlFor="w-id">
              Employee ID
            </label>
            <input
              id="w-id"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              placeholder="6-digit ID"
              className={wErr.employee_id ? "bad" : ""}
              value={wId}
              onChange={(e) => setWId(e.target.value.replace(/\D/g, "").slice(0, 6))}
            />
            <div className="err">{wErr.employee_id}</div>
          </div>
          <div className="field">
            <label className="req" htmlFor="w-fullname">
              Full name
            </label>
            <input
              id="w-fullname"
              type="text"
              className={wErr.full_name ? "bad" : ""}
              value={wName}
              onChange={(e) => setWName(e.target.value)}
            />
            <div className="err">{wErr.full_name}</div>
          </div>
          <div className="row">
            <div className="field">
              <label className="req" htmlFor="w-email">
                Email
              </label>
              <input
                id="w-email"
                type="email"
                inputMode="email"
                className={wErr.email ? "bad" : ""}
                value={wEmail}
                onChange={(e) => setWEmail(e.target.value)}
              />
              <div className="err">{wErr.email}</div>
            </div>
            <div className="field">
              <label className="req" htmlFor="w-mobile">
                Mobile number
              </label>
              <input
                id="w-mobile"
                type="tel"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={10}
                placeholder="10 digits"
                className={wErr.mobile ? "bad" : ""}
                value={wMobile}
                onChange={(e) => setWMobile(e.target.value.replace(/\D/g, "").slice(0, 10))}
              />
              <div className="err">{wErr.mobile}</div>
            </div>
          </div>
          <div className="field">
            <span className="lbl">
              Marital status <span style={{ color: "var(--faint)", fontWeight: 500 }}>(optional)</span>
            </span>
            <div className="chips">
              {["Single", "Married"].map((m) => (
                <button
                  key={m}
                  type="button"
                  className="chip"
                  aria-pressed={wMarital === m}
                  onClick={() => {
                    setWMarital(m);
                    setWFam([]);
                  }}
                >
                  <span className="tick" />
                  {m}
                </button>
              ))}
            </div>
          </div>
          <FamilySelector
            maritalStatus={wMarital}
            family={wFam}
            onFamilyChange={setWFam}
            paid={wPaid}
            onPaidChange={setWPaid}
          />
          <div className="tally">
            <div>
              <small>Total wristbands, including you</small>
              <b>{1 + wFam.length + wPaid.length}</b>
            </div>
          </div>
          <div className="actions">
            <button className="btn" onClick={submitWalkin} disabled={wSubmitting}>
              {wSubmitting ? "Registering…" : "Register"}
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
      </div>
    </main>
  );
}

function Pills({ emp }: { emp: EmployeeFull }) {
  const wb = wristbandTotal(emp.family_members, emp.paid_extended);
  return (
    <div className="pills">
      <span className="pill">
        {wb} wristband{wb > 1 ? "s" : ""}
      </span>
    </div>
  );
}

function formatTime(iso: string | null): string {
  if (!iso) return "earlier";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "earlier";
  return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}
