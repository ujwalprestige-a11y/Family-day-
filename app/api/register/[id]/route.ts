import { NextRequest, NextResponse, after } from "next/server";
import { prisma } from "@/lib/db";
import { Status } from "@prisma/client";
import { isValidEmail, isValidMobile, isNonEmptyName, normaliseMobile } from "@/lib/validation";
import { wristbandTotal } from "@/lib/wristbands";
import { sendConfirmationEmail } from "@/lib/email";

export const dynamic = "force-dynamic";
export const preferredRegion = "bom1"; // run in Mumbai, next to the Supabase DB

interface RegisterBody {
  full_name?: string;
  email?: string;
  mobile?: string;
  family_members?: string[];
  paid_extended?: string[];
}

function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = new Set(a);
  for (const x of b) if (!sa.has(x)) return false;
  return true;
}

// POST /api/register/:id — validate, save edits, record changed fields, set
// pre_registered. Idempotent: an already-registered record is returned untouched.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  const existing = await prisma.employee.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // Idempotency: never overwrite an already-registered / walk-in record.
  if (existing.status !== Status.not_registered) {
    return NextResponse.json({ result: "already_registered", employee: existing });
  }

  let body: RegisterBody;
  try {
    body = (await req.json()) as RegisterBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const full_name = (body.full_name ?? "").trim();
  const email = (body.email ?? "").trim();
  const mobileRaw = (body.mobile ?? "").trim();
  const mobile = normaliseMobile(mobileRaw);
  const family_members = Array.isArray(body.family_members) ? body.family_members : [];
  const paid_extended = Array.isArray(body.paid_extended) ? body.paid_extended : [];

  const errors: Record<string, string> = {};
  if (!isNonEmptyName(full_name)) errors.full_name = "Enter your full name.";
  if (!isValidEmail(email)) errors.email = "Enter a valid email, like name@company.com.";
  if (!isValidMobile(mobileRaw)) errors.mobile = "Enter a 10-digit mobile number.";
  if (Object.keys(errors).length > 0) {
    return NextResponse.json({ errors }, { status: 422 });
  }

  // Determine which fields changed relative to the stored record.
  const edited: string[] = [];
  if (full_name !== existing.full_name) edited.push("full_name");
  if (email !== existing.email) edited.push("email");
  if (mobile !== existing.mobile) edited.push("mobile");
  if (!sameSet(existing.family_members, family_members)) edited.push("family_members");
  if (!sameSet(existing.paid_extended, paid_extended)) edited.push("paid_extended");

  const employee = await prisma.employee.update({
    where: { id },
    data: {
      full_name,
      email,
      mobile,
      family_members,
      paid_extended,
      wristbands_total: wristbandTotal(family_members, paid_extended),
      edited_fields: edited,
      status: Status.pre_registered,
      registered_at: new Date(),
      needs_review: false,
    },
  });

  // Send the confirmation email after the response is sent (non-blocking).
  // Guarded so non-request contexts (e.g. unit tests) don't fail.
  try {
    after(async () => {
      try {
        await sendConfirmationEmail(employee);
      } catch (err) {
        console.error("[email] Failed to send confirmation (register):", err);
      }
    });
  } catch {
    /* `after` unavailable outside a request scope */
  }

  return NextResponse.json({ result: "registered", employee });
}
