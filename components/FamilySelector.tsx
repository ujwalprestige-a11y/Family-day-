import { Chip } from "./Chip";

// Countable relations use a dropdown (there can be several); singular ones use a chip.
export const CHILD_MAX = 3;
export const SIBLING_MAX = 10;
export const OTHERS_MAX = 10;

function count(arr: string[], prefix: string): number {
  return arr.filter((x) => x === prefix || x.startsWith(prefix + " ")).length;
}

function toggleItem(arr: string[], val: string): string[] {
  return arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val];
}

// Replace all "<prefix> N" entries with "<prefix> 1".."<prefix> n", preserving everything else.
function setCount(arr: string[], prefix: string, n: number): string[] {
  const rest = arr.filter((x) => !(x === prefix || x.startsWith(prefix + " ")));
  const added = Array.from({ length: n }, (_, i) => `${prefix} ${i + 1}`);
  return [...rest, ...added];
}

function CountSelect({
  label,
  prefix,
  max,
  arr,
  onChange,
}: {
  label: string;
  prefix: string;
  max: number;
  arr: string[];
  onChange: (next: string[]) => void;
}) {
  const value = count(arr, prefix);
  const id = `cnt-${prefix.replace(/\s+/g, "-").toLowerCase()}`;
  return (
    <label className="countsel" htmlFor={id}>
      <span>{label}</span>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(setCount(arr, prefix, Number(e.target.value)))}
      >
        {Array.from({ length: max + 1 }, (_, i) => (
          <option key={i} value={i}>
            {i}
          </option>
        ))}
      </select>
    </label>
  );
}

export function FamilySelector({
  maritalStatus,
  family,
  onFamilyChange,
  paid,
  onPaidChange,
}: {
  maritalStatus: string;
  family: string[];
  onFamilyChange: (next: string[]) => void;
  paid: string[];
  onPaidChange: (next: string[]) => void;
}) {
  const married = (maritalStatus ?? "").trim().toLowerCase() === "married";

  return (
    <>
      <div className="field">
        <span className="lbl">Free wristbands for family</span>
        <div className="chips">
          {married ? (
            <>
              <Chip
                label="Spouse"
                pressed={family.includes("Spouse")}
                onToggle={() => onFamilyChange(toggleItem(family, "Spouse"))}
              />
              <CountSelect
                label="Children"
                prefix="Child"
                max={CHILD_MAX}
                arr={family}
                onChange={onFamilyChange}
              />
            </>
          ) : (
            <>
              <Chip
                label="Parent 1"
                pressed={family.includes("Parent 1")}
                onToggle={() => onFamilyChange(toggleItem(family, "Parent 1"))}
              />
              <Chip
                label="Parent 2"
                pressed={family.includes("Parent 2")}
                onToggle={() => onFamilyChange(toggleItem(family, "Parent 2"))}
              />
            </>
          )}
        </div>
      </div>

      <div className="field">
        <span className="lbl">Extended family</span>
        <div className="chips">
          <Chip
            label="Parent 1"
            paid
            pressed={paid.includes("Parent 1")}
            onToggle={() => onPaidChange(toggleItem(paid, "Parent 1"))}
          />
          <Chip
            label="Parent 2"
            paid
            pressed={paid.includes("Parent 2")}
            onToggle={() => onPaidChange(toggleItem(paid, "Parent 2"))}
          />
          <CountSelect
            label="Siblings"
            prefix="Sibling"
            max={SIBLING_MAX}
            arr={paid}
            onChange={onPaidChange}
          />
          <CountSelect
            label="Others"
            prefix="Others"
            max={OTHERS_MAX}
            arr={paid}
            onChange={onPaidChange}
          />
        </div>
      </div>
    </>
  );
}
