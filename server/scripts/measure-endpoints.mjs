import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
dotenv.config();

const prisma = new PrismaClient();
const user = await prisma.user.findFirst({ where: { email: 'dvir3146@gmail.com' } });
const token = jwt.sign({ userId: user.id, type: 'access' }, process.env.JWT_SECRET, { expiresIn: '15m' });

console.log('=== Combined endpoint (all-in-one: dashboard + groups + templates) ===');
const s1 = Date.now();
const r1 = await fetch('http://localhost:8000/api/scheduler/dashboard-data', {
  headers: { 'Authorization': `Bearer ${token}` },
});
const d1 = await r1.json();
console.log(`  dashboard-data: ${Date.now() - s1}ms (${r1.status})`);
console.log(`  → jobs: ${d1.jobs?.length}, history: ${d1.history?.length}, campaigns: ${d1.campaigns?.length}, groups: ${d1.groups?.length}, templates: ${d1.templates?.length}`);

console.log('\n=== Second call (warm connection) ===');
const s2 = Date.now();
const r2 = await fetch('http://localhost:8000/api/scheduler/dashboard-data', {
  headers: { 'Authorization': `Bearer ${token}` },
});
await r2.json();
console.log(`  dashboard-data: ${Date.now() - s2}ms (${r2.status})`);

console.log('\n=== Third call (steady state) ===');
const s3 = Date.now();
const r3 = await fetch('http://localhost:8000/api/scheduler/dashboard-data', {
  headers: { 'Authorization': `Bearer ${token}` },
});
await r3.json();
console.log(`  dashboard-data: ${Date.now() - s3}ms (${r3.status})`);

await prisma.$disconnect();
