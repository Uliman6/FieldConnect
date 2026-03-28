require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function seedAdmin() {
  const email = process.env.ADMIN_EMAIL || '***REMOVED***';
  const password = process.env.ADMIN_PASSWORD || '***REMOVED***';
  const name = 'Admin';

  console.log('Seeding admin user...');
  console.log(`Email: ${email}`);

  try {
    // Check if admin already exists
    const existingAdmin = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (existingAdmin) {
      console.log('Admin user already exists. Updating...');
      const passwordHash = await bcrypt.hash(password, 12);
      await prisma.user.update({
        where: { email: email.toLowerCase() },
        data: {
          passwordHash,
          role: 'ADMIN',
          isActive: true,
        },
      });
      console.log('Admin user updated successfully.');
    } else {
      const passwordHash = await bcrypt.hash(password, 12);
      await prisma.user.create({
        data: {
          email: email.toLowerCase(),
          passwordHash,
          name,
          role: 'ADMIN',
          isActive: true,
        },
      });
      console.log('Admin user created successfully.');
    }

    console.log('\nYou can now login with:');
    console.log(`  Email: ${email}`);
    console.log(`  Password: ${password}`);
    console.log('\nIMPORTANT: Change these credentials in .env for production!');
  } catch (error) {
    console.error('Error seeding admin:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

seedAdmin();
