import 'dotenv/config';
import * as argon2 from 'argon2';
import { PrismaClient } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

// Creates the two things with no runtime creation path: the single Partner and
// the first admin login. Idempotent - safe to re-run.
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  // No fallback for the code: this must be the same value the app resolves at
  // signup (RiderAuthService, via getOrThrow). Defaulting here while the app
  // demands it would seed a partner the app then refuses to start without.
  const code = process.env.DEFAULT_PARTNER_CODE;
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;

  if (!code || !email || !password) {
    throw new Error(
      'DEFAULT_PARTNER_CODE, SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD must be set (see .env.example)',
    );
  }

  const partner = await prisma.partner.upsert({
    where: { code },
    create: { code, name: 'ELVO' },
    update: {},
  });

  const passwordHash = await argon2.hash(password);

  // Only the hash is updated on re-run, so a reseed cannot silently move an
  // existing admin to a different partner.
  await prisma.adminUser.upsert({
    where: { email },
    create: { email, name: 'Admin', passwordHash, partnerId: partner.id },
    update: { passwordHash },
  });

  console.log(
    `Seeded partner "${partner.name}" (${partner.code}) and admin ${email}`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
