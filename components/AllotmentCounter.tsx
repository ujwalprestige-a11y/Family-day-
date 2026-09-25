"use client";

import { MAX_ADULTS, MAX_CHILDREN } from "@/lib/allotment";

/**
 * A single -/+ stepper. Large hit targets because this is used on a tablet at a
 * busy desk, and the number is an <output> with aria-live so screen readers
 * announce the change.
 */
function Stepper({
  id,
  label,
  hint,
  value,
  allotted,
  max,
  onChange,
}: {
  id: string;
  label: string;
  hint?: string;
  value: number;
  allotted: number;
  max: number;
  onChange: (next: number) => void;
}) {
  const over = value > allotted;

  return (
    <div className={`stepper${over ? " over" : ""}`}>
      <div className="stepper-head">
        <span className="stepper-label" id={`${id}-label`}>
          {label}
        </span>
        <span className="stepper-allot">
          allotted <b>{allotted}</b>
        </span>
      </div>

      <div className="stepper-controls">
        <button
          type="button"
          aria-label={`One fewer ${label.toLowerCase()}`}
          disabled={value <= 0}
          onClick={() => onChange(Math.max(0, value - 1))}
        >
          −
        </button>

        <output
          id={id}
          aria-labelledby={`${id}-label`}
          aria-live="polite"
          className="stepper-value"
        >
          {value}
        </output>

        <button
          type="button"
          aria-label={`One more ${label.toLowerCase()}`}
          disabled={value >= max}
          onClick={() => onChange(Math.min(max, value + 1))}
        >
          +
        </button>
      </div>

      {hint && <span className="stepper-hint">{hint}</span>}
    </div>
  );
}

/**
 * Adult + children counters for a check-in.
 *
 * `allottedAdults` / `allottedChildren` come from the master sheet and are shown
 * as read-only reference. The editable values are what is actually being issued,
 * which the desk may set above or below the allotment.
 */
export function AllotmentCounter({
  allottedAdults,
  allottedChildren,
  adults,
  children,
  onAdultsChange,
  onChildrenChange,
}: {
  allottedAdults: number;
  allottedChildren: number;
  adults: number;
  children: number;
  onAdultsChange: (next: number) => void;
  onChildrenChange: (next: number) => void;
}) {
  return (
    <div className="allotgrid">
      <Stepper
        id="cnt-adults"
        label="Adults"
        hint="Including the employee"
        value={adults}
        allotted={allottedAdults}
        max={MAX_ADULTS}
        onChange={onAdultsChange}
      />
      <Stepper
        id="cnt-children"
        label="Children"
        value={children}
        allotted={allottedChildren}
        max={MAX_CHILDREN}
        onChange={onChildrenChange}
      />
    </div>
  );
}
