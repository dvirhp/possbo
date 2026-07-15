import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const user = await prisma.user.findFirst({
  where: { email: 'dvir3146@gmail.com' },
  select: { id: true, email: true, fbSessionValid: true, facebookStorageState: true, facebookAccessToken: true }
});
const hasState = user?.facebookStorageState ? true : false;
const hasToken = user?.facebookAccessToken ? true : false;
console.log(JSON.stringify({ id: user?.id, email: user?.email, fbSessionValid: user?.fbSessionValid, hasStorageState: hasState, hasAccessToken: hasToken }, null, 2));
await prisma.$disconnect();
