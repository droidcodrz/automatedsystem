import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Create admin user
  const adminPassword = await bcrypt.hash('admin123456', 12);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@vfs-automation.local' },
    update: {},
    create: {
      email: 'admin@vfs-automation.local',
      passwordHash: adminPassword,
      name: 'Admin',
      role: 'ADMIN',
    },
  });

  console.log(`Admin user created: ${admin.email}`);

  // Create operator user
  const operatorPassword = await bcrypt.hash('operator123456', 12);
  const operator = await prisma.user.upsert({
    where: { email: 'operator@vfs-automation.local' },
    update: {},
    create: {
      email: 'operator@vfs-automation.local',
      passwordHash: operatorPassword,
      name: 'Operator',
      role: 'OPERATOR',
    },
  });

  console.log(`Operator user created: ${operator.email}`);
  console.log('Seed completed.');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
