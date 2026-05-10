const bcrypt = require("bcryptjs");
const { loadEnv, requiredEnv } = require("../config/env");

loadEnv();
requiredEnv(["DATABASE_URL", "ADMIN_EMAIL", "ADMIN_PASSWORD"]);

const prisma = require("../lib/prisma");

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

async function main() {
  const email = normalizeEmail(process.env.ADMIN_EMAIL);
  const password = process.env.ADMIN_PASSWORD;
  const displayName = process.env.ADMIN_NAME || "Shiba Admin";

  if (password.length < 12) {
    throw new Error("ADMIN_PASSWORD must be at least 12 characters");
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const user = await prisma.user.upsert({
    where: { email },
    update: {
      role: "ADMIN",
      status: "ACTIVE",
      displayName,
      identities: {
        upsert: {
          where: {
            provider_providerUserId: {
              provider: "PASSWORD",
              providerUserId: email,
            },
          },
          update: { passwordHash },
          create: {
            provider: "PASSWORD",
            providerUserId: email,
            passwordHash,
          },
        },
      },
    },
    create: {
      email,
      displayName,
      role: "ADMIN",
      identities: {
        create: {
          provider: "PASSWORD",
          providerUserId: email,
          passwordHash,
        },
      },
    },
  });

  console.log(`Admin ready: ${user.email}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
