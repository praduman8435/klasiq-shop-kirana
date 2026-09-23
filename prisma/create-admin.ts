/**
 * Bootstraps a Klasiq Admin user from environment variables. Deliberately
 * separate from prisma/seed.ts: seed.ts creates demo/dev-only catalog data
 * that must never run against a real deployment, while this script only
 * ever touches the admin_users table and is safe (idempotent) to run
 * anywhere, including production, to create the first operator account.
 *
 * Usage: npm run db:create-admin
 * Reads: ADMIN_BOOTSTRAP_NAME, ADMIN_BOOTSTRAP_EMAIL, ADMIN_BOOTSTRAP_PASSWORD
 *
 * See docs/PHASE_3_REPORT.md ("Authentication/session strategy" — bootstrap
 * procedure) for the full explanation.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/admin/password";

const db = new PrismaClient();

async function main() {
  const name = process.env.ADMIN_BOOTSTRAP_NAME?.trim();
  const email = process.env.ADMIN_BOOTSTRAP_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_BOOTSTRAP_PASSWORD;

  if (!name || !email || !password) {
    console.error(
      "Missing ADMIN_BOOTSTRAP_NAME, ADMIN_BOOTSTRAP_EMAIL, or ADMIN_BOOTSTRAP_PASSWORD.\n" +
        "Set all three (e.g. in .env, or inline on the command) and re-run:\n" +
        "  ADMIN_BOOTSTRAP_NAME=\"Shop Owner\" ADMIN_BOOTSTRAP_EMAIL=\"owner@example.com\" ADMIN_BOOTSTRAP_PASSWORD=\"...\" npm run db:create-admin",
    );
    process.exitCode = 1;
    return;
  }

  if (password.length < 8) {
    console.error("ADMIN_BOOTSTRAP_PASSWORD must be at least 8 characters.");
    process.exitCode = 1;
    return;
  }

  const existing = await db.adminUser.findUnique({ where: { email } });
  if (existing) {
    console.log(`Admin user already exists for ${email} — no changes made.`);
    console.log("To reset a password, use the admin UI once signed in, or update it directly for now.");
    return;
  }

  const passwordHash = await hashPassword(password);
  await db.adminUser.create({
    data: { name, email, passwordHash, isActive: true },
  });

  console.log(`Created Klasiq Admin user: ${email}`);
  console.log("You can now sign in at /admin/login. Consider rotating this password after first login.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
