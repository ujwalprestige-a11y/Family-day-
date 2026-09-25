export type Status = "not_arrived" | "checked_in";
export type Source = "master" | "walk_in";

/** Trimmed shape returned by /api/search — enough to pick the right person. */
export interface SearchResult {
  id: string;
  employee_id: string;
  full_name: string;
  entity: string;
  department: string;
  allotted_adults: number;
  allotted_children: number;
  status: Status;
}

/** Full record returned by /api/employee/:id and the register/walk-in routes. */
export interface EmployeeFull {
  id: string;
  employee_id: string;
  full_name: string;
  entity: string;
  department: string;
  allotted_adults: number;
  allotted_children: number;
  actual_adults: number;
  actual_children: number;
  status: Status;
  source: Source;
  registered_at: string | null;
  needs_review: boolean;
}

export type AdminRow = EmployeeFull;

export interface AdminTiles {
  in_master: number;
  checked_in: number;
  not_yet_arrived: number;
  walk_ins: number;
  allotted_adults: number;
  allotted_children: number;
  allotted_total: number;
  actual_adults: number;
  actual_children: number;
  actual_total: number;
  over_allotment: number;
}
