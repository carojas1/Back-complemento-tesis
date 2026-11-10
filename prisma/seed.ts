// Creates the initial administrator of «Centro» with ADMIN_NAME, ADMIN_EMAIL and ADMIN_PASSWORD from the .env and, if
// SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD are set, the platform super administrator (spec 113). If they already exist it does nothing:
// running it again never changes a password.
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { isEmail } from 'class-validator';
import { Role, User, assertPasswordPolicy } from '../src/auth/domain/entities/user.entity';
import { Argon2PasswordHasher } from '../src/auth/infrastructure/security/argon2-password.hasher';
import { AuthPrismaMapper } from '../src/auth/infrastructure/prisma/auth.prisma.mapper';
import { baseInstitutionId } from '../src/tenancy/tenancy';

// As table owner (no RLS): the institution is explicit.
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

async function createAccount(
  role: Role,
  name: string,
  email: string | undefined,
  password: string | undefined,
  institutionId: string | null,
) {
  if (await prisma.user.count({ where: { role, institutionId } })) {
    console.log(`A ${role} already exists: not creating another.`);
    return;
  }
  if (!email || !isEmail(email) || !password) throw new Error(`Set the email and password for ${role} in the .env`);
  assertPasswordPolicy(password);
  // Temporary password: must be changed on first login.
  const passwordHash = await new Argon2PasswordHasher().hash(password);
  const user = User.create({ name, email, passwordHash, role, mustChangePassword: true });
  await prisma.user.create({ data: { ...AuthPrismaMapper.userToPrisma(user), institutionId } });
  await prisma.auditLog.create({
    data: {
      institutionId,
      actorType: 'SYSTEM',
      action: 'USER_CREATE',
      entity: 'User',
      entityId: user.id,
      summary: { role, source: 'seed' },
    },
  });
  console.log(`${role} creado: ${user.email}`);
}

async function main() {
  const env = process.env;
  await createAccount(Role.ADMIN, env.ADMIN_NAME ?? 'Administrador', env.ADMIN_EMAIL, env.ADMIN_PASSWORD, baseInstitutionId);
  if (env.SUPER_ADMIN_EMAIL)
    await createAccount(
      Role.SUPER_ADMIN,
      env.SUPER_ADMIN_NAME ?? 'Plataforma Necon',
      env.SUPER_ADMIN_EMAIL,
      env.SUPER_ADMIN_PASSWORD,
      null,
    );
}

main()
  .catch((error: Error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
