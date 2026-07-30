import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const provider = await prisma.provider.upsert({
    where: { id: 'P1' },
    update: {},
    create: {
      id: 'P1',
      name: 'LSP Courier Inc',
      shortDesc: 'LSP Courier Inc',
      longDesc: 'LSP Courier Inc',
    },
  });

  await prisma.category.upsert({
    where: { id: 'Standard Delivery' },
    update: {},
    create: { id: 'Standard Delivery' },
  });

  const children = [
    { id: 'Immediate Delivery', tatMinutes: 60, basePrice: 59.0 },
    { id: 'Same Day Delivery', tatMinutes: 360, basePrice: 45.0 },
    { id: 'Next Day Delivery', tatMinutes: 1440, basePrice: 35.0 },
  ];

  for (const child of children) {
    await prisma.category.upsert({
      where: { id: child.id },
      update: {},
      create: {
        id: child.id,
        parentId: 'Standard Delivery',
        shipmentType: 'P2P',
        tatMinutes: child.tatMinutes,
        basePrice: child.basePrice,
      },
    });
  }

  const areaCodes = ['560041', '560001', '560076'];
  for (const areaCode of areaCodes) {
    for (const child of children) {
      await prisma.serviceableArea.upsert({
        where: {
          providerId_areaCode_categoryId: {
            providerId: provider.id,
            areaCode,
            categoryId: child.id,
          },
        },
        update: {},
        create: { providerId: provider.id, areaCode, categoryId: child.id },
      });
    }
  }

  console.log('Seed complete.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
