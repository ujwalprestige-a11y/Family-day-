import nodemailer from "nodemailer";
import { PRICE_PER_PAID } from "./wristbands";

// Minimal shape needed to render the confirmation email.
export interface ConfirmationEmployee {
  employee_id: string;
  full_name: string;
  email: string;
  mobile: string;
  family_members: string[];
  paid_extended: string[];
  wristbands_total: number;
}

const MAIL_FROM = process.env.MAIL_FROM || "amar.v@prestigeconstructions.com";

/**
 * Build an SMTP transport from env vars. Returns null when SMTP isn't
 * configured, so registration still works without email set up.
 */
function buildTransport(): nodemailer.Transporter | null {
  const host = process.env.SMTP_HOST;
  if (!host) return null;
  return nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true", // true for port 465, false for 587 (STARTTLS)
    auth:
      process.env.SMTP_USER && process.env.SMTP_PASS
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
  });
}

function listOrNone(items: string[]): string {
  return items.length ? items.join(", ") : "None";
}

export function renderConfirmation(emp: ConfirmationEmployee): {
  subject: string;
  text: string;
  html: string;
} {
  const family = listOrNone(emp.family_members);
  const paid = listOrNone(emp.paid_extended);
  const amountDue = emp.paid_extended.length * PRICE_PER_PAID;

  const subject = "Registration Confirmed – Prestige Family Day 2026, Beyond the Skyline";

  const text = `Dear ${emp.full_name},

Thank you for registering for Prestige Family Day 2026 — Beyond the Skyline, on 26 September 2026.

Here are your registration details:

Employee ID: ${emp.employee_id}
Name: ${emp.full_name}
Mobile: ${emp.mobile}
Family joining you (free): ${family}
Extended family (paid, ₹2,500 each): ${paid}
Total wristbands: ${emp.wristbands_total}
Amount payable: ₹${amountDue.toLocaleString("en-IN")}

If any of these details are incorrect, please visit the registration desk on the day to update them.

We look forward to celebrating with you and your family.

Warm regards,
Prestige Group`;

  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#1F1A12;line-height:1.6;font-size:15px">
  <p>Dear ${esc(emp.full_name)},</p>
  <p>Thank you for registering for <strong>Prestige Family Day 2026 — Beyond the Skyline</strong>, on 26 September 2026.</p>
  <p>Here are your registration details:</p>
  <table cellpadding="0" cellspacing="0" style="border-collapse:collapse">
    <tr><td style="padding:2px 12px 2px 0"><strong>Employee ID</strong></td><td>${esc(emp.employee_id)}</td></tr>
    <tr><td style="padding:2px 12px 2px 0"><strong>Name</strong></td><td>${esc(emp.full_name)}</td></tr>
    <tr><td style="padding:2px 12px 2px 0"><strong>Mobile</strong></td><td>${esc(emp.mobile)}</td></tr>
    <tr><td style="padding:2px 12px 2px 0"><strong>Family joining you (free)</strong></td><td>${esc(family)}</td></tr>
    <tr><td style="padding:2px 12px 2px 0"><strong>Extended family (paid, ₹2,500 each)</strong></td><td>${esc(paid)}</td></tr>
    <tr><td style="padding:2px 12px 2px 0"><strong>Total wristbands</strong></td><td>${emp.wristbands_total}</td></tr>
    <tr><td style="padding:2px 12px 2px 0"><strong>Amount payable</strong></td><td>₹${amountDue.toLocaleString("en-IN")}</td></tr>
  </table>
  <p>If any of these details are incorrect, please visit the registration desk on the day to update them.</p>
  <p>We look forward to celebrating with you and your family.</p>
  <p>Warm regards,<br/>Prestige Group</p>
</div>`;

  return { subject, text, html };
}

/**
 * Send the confirmation email. No-ops (with a log) when SMTP isn't configured
 * or the recipient email is missing. Never throws to the caller's critical path
 * — callers should still wrap in try/catch.
 */
export async function sendConfirmationEmail(emp: ConfirmationEmployee): Promise<void> {
  const transport = buildTransport();
  if (!transport) {
    console.warn("[email] SMTP not configured (SMTP_HOST unset); skipping confirmation email.");
    return;
  }
  if (!emp.email) {
    console.warn("[email] No recipient email; skipping confirmation email.");
    return;
  }
  const { subject, text, html } = renderConfirmation(emp);
  await transport.sendMail({ from: MAIL_FROM, to: emp.email, subject, text, html });
  console.log(`[email] Confirmation sent to ${emp.email} (employee ${emp.employee_id}).`);
}
