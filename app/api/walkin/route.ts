import { NextRequest, NextResponse, after } from "next/server";
import { prisma } from "@/lib/db";
import { Status, Source } from "@prisma/client";
import { isValidEmail, isValidMobile, isNonEmptyName, isValidEmployeeId, normaliseMobile } from "@/lib/validation";
import { wristbandTotal } from "@/lib/wristbands";
import { sendConfirmationEmail } from "@/lib/email";

export const dynamic = "force-dynamic";
export const preferredRegion = "bom1"; // run in Mumbai, next to the Supabase DB

interface WalkinBody {
  employee_id?: string;
  full_name?: string;
  email?: string;
  mobile?: string;
  marital_status?: string;
  family_members?: string[];
  paid_extended?: string[];
}

// POST /api/walkin — create a walk-in record. Rejects an employee_id that
// already exists (guest should search instead).
export async function POST(req: NextRequest) {
  let body: WalkinBody;
  try {
    body = (await req.json()) as WalkinBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const employee_id = (body.employee_id ?? "").trim();
  const full_name = (body.full_name ?? "").trim();
  const email = (body.email ?? "").trim();
  const mobileRaw = (body.mobile ?? "").trim();
  const mobile = normaliseMobile(mobileRaw);
  const marital_status = (body.marital_status ?? "").trim();
  const family_members = Array.isArray(body.family_members) ? body.family_members : [];
  const paid_extended = Array.isArray(body.paid_extended) ? body.paid_extended : [];

  const errors: Record<string, string> = {};
  if (!employee_id) errors.employee_id = "Enter your employee ID.";
  else if (!isValidEmployeeId(employee_id)) errors.employee_id = "Employee ID must be exactly 6 digits.";
  if (!isNonEmptyName(full_name)) errors.full_name = "Enter your full name.";
  if (!isValidEmail(email)) errors.email = "Enter a valid email, like name@company.com.";
  if (!isValidMobile(mobileRaw)) errors.mobile = "Enter a 10-digit mobile number.";
  if (Object.keys(errors).length > 0) {
    return NextResponse.json({ errors }, { status: 422 });
  }

  const clash = await prisma.employee.findFirst({ where: { employee_id } });
  if (clash) {
    return NextResponse.json(
      {
        error: "exists",
        message: "This ID is already in the list. Please search for it on the first screen.",
      },
      { status: 409 }
    );
  }

  const employee = await prisma.employee.create({
    data: {
      employee_id,
      full_name,
      email,
      mobile,
      marital_status,
      family_members,
      paid_extended,
      wristbands_total: wristbandTotal(family_members, paid_extended),
      status: Status.walk_in,
      source: Source.walk_in,
      registered_at: new Date(),
      needs_review: false,
      edited_fields: [],
    },
  });

  // Send the confirmation email after the response is sent (non-blocking).
  // Guarded so non-request contexts (e.g. unit tests) don't fail.
  try {
    after(async () => {
      try {
        await sendConfirmationEmail(employee);
      } catch (err) {
        console.error("[email] Failed to send confirmation (walkin):", err);
      }
    });
  } catch {
    /* `after` unavailable outside a request scope */
  }

  return NextResponse.json({ result: "walkin", employee }, { status: 201 });
}
