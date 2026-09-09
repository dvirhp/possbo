import "dotenv/config";
import prisma from "../src/config/prisma.js";

const requestedEmails = process.argv.slice(2).map((value) => value.trim().toLowerCase());
const users = await prisma.user.findMany({
  where: requestedEmails.length ? { email: { in: requestedEmails } } : undefined,
  select: { id: true, email: true },
  orderBy: { email: "asc" },
});

const scalar = async (sql) => Number((await prisma.$queryRawUnsafe(sql))[0]?.count || 0);

for (const user of users) {
  const [facebookGroups, canonicalGroups, posts, postGroups, publications, accounts, whatsappContacts] = await Promise.all([
    prisma.facebookGroup.count({ where: { userId: user.id } }),
    prisma.userGroup.count({ where: { userId: user.id } }),
    prisma.post.count({ where: { userId: user.id } }),
    prisma.postGroup.count({ where: { userId: user.id } }),
    prisma.publicationHistory.count({ where: { userId: user.id } }),
    prisma.connectedAccount.groupBy({ by: ["provider", "status"], where: { userId: user.id }, _count: { id: true } }),
    prisma.whatsAppContact.count({ where: { userId: user.id } }),
  ]);
  console.log(JSON.stringify({
    email: user.email,
    userId: user.id,
    facebookGroups,
    canonicalGroups,
    posts,
    postGroups,
    publications,
    whatsappContacts,
    accounts: accounts.map((row) => ({ provider: row.provider, status: row.status, count: row._count.id })),
  }));
}

const integrity = {
  postGroupWrongUser: await scalar('SELECT COUNT(*)::int AS count FROM post_groups pg JOIN posts p ON p.id = pg.post_id WHERE pg.user_id <> p.user_id'),
  publicationWrongPostUser: await scalar('SELECT COUNT(*)::int AS count FROM publication_history ph JOIN posts p ON p.id = ph.post_id WHERE ph.user_id <> p.user_id'),
  publicationWrongPostGroupUser: await scalar('SELECT COUNT(*)::int AS count FROM publication_history ph JOIN post_groups pg ON pg.id = ph.post_group_id WHERE ph.post_group_id IS NOT NULL AND ph.user_id <> pg.user_id'),
  userGroupWrongAccountUser: await scalar('SELECT COUNT(*)::int AS count FROM user_groups ug JOIN connected_accounts ca ON ca.id = ug.connected_account_id WHERE ug.connected_account_id IS NOT NULL AND ug.user_id <> ca.user_id'),
  duplicateFacebookGroupLinks: await scalar('SELECT COUNT(*)::int AS count FROM (SELECT user_id, group_id FROM facebook_groups GROUP BY user_id, group_id HAVING COUNT(*) > 1) duplicates'),
  duplicateCanonicalGroupLinks: await scalar('SELECT COUNT(*)::int AS count FROM (SELECT user_id, group_id FROM user_groups GROUP BY user_id, group_id HAVING COUNT(*) > 1) duplicates'),
  multipleActiveAccountsPerProvider: await scalar("SELECT COUNT(*)::int AS count FROM (SELECT user_id, provider FROM connected_accounts WHERE status = 'ACTIVE' GROUP BY user_id, provider HAVING COUNT(*) > 1) duplicates"),
};

console.log(JSON.stringify({ integrity }));
await prisma.$disconnect();
