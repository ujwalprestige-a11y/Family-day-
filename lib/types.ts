export type Status = "not_registered" | "pre_registered" | "walk_in";
export type Source = "master" | "walk_in";

export interface SearchResult {
  id: string;
  employee_id: string;
  full_name: string;
  marital_status: string;
  mobile: string;
  status: Status;
}

export interface EmployeeFull {
  id: string;
  employee_id: string;
  full_name: string;
  email: string;
  mobile: string;
  marital_status: string;
  family_members: string[];
  paid_extended: string[];
  wristbands_total: number;
  status: Status;
  source: Source;
  edited_fields: unknown;
  registered_at: string | null;
  needs_review: boolean;
}

export interface AdminRow extends EmployeeFull {
  edited_fields: string[];
}

export interface AdminTiles {
  in_master: number;
  pre_registered: number;
  walk_ins: number;
  not_yet_arrived: number;
  wristbands_issued: number;
  amount_to_collect: number;
}
