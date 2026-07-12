import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const userId = "151fa87c-455b-41fc-93b6-b00ad6313355";

async function main() {
  // Create 3 groups
  const groupData = [
    { name: 'נדל"ן תל אביב', memberCount: 45200 },
    { name: "דירות להשכרה ירושלים", memberCount: 32100 },
    { name: 'עסקאות נדל"ן חיפה', memberCount: 18700 },
  ];
  const groups = [];

  for (const gd of groupData) {
    const group = await prisma.group.create({
      data: {
        name: gd.name,
        url: `https://facebook.com/groups/test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        memberCount: gd.memberCount,
      },
    });
    // Link to user via UserGroup
    await prisma.userGroup.create({
      data: { userId, groupId: group.id },
    });
    groups.push(group);
    console.log(`Group: ${group.name} (${group.id})`);
  }

  // Create the post (campaign)
  const post = await prisma.post.create({
    data: {
      userId,
      title: "דירת 4 חדרים למכירה - מבצע!",
      content:
        "🏠 דירת 4 חדרים מרווחת בשכונה מבוקשת\n📍 קומה 5 מתוך 8, מעלית, חניה\n💰 מחיר אטרקטיבי - 2,100,000 ₪\n📞 לפרטים נוספים: 050-1234567",
      status: "ACTIVE",
      campaignType: "ONE_TIME",
    },
  });
  console.log(`Post created: ${post.id}`);

  // Create PostGroups + 2 publications per group
  for (const group of groups) {
    const postGroup = await prisma.postGroup.create({
      data: {
        post: { connect: { id: post.id } },
        group: { connect: { id: group.id } },
        user: { connect: { id: userId } },
      },
    });

    // Create 2 publication history records per group (published at different times)
    for (let i = 0; i < 2; i++) {
      const publishedAt = new Date();
      publishedAt.setDate(
        publishedAt.getDate() - (i * 3 + Math.floor(Math.random() * 3)),
      ); // stagger by days
      publishedAt.setHours(
        Math.floor(Math.random() * 12) + 8,
        Math.floor(Math.random() * 60),
      );

      const ph = await prisma.publicationHistory.create({
        data: {
          postId: post.id,
          groupId: group.id,
          userId,
          postGroupId: postGroup.id,
          status: "SUCCESS",
          publishedAt,
          externalPostUrl: `https://www.facebook.com/groups/${group.id}/posts/${Date.now()}${i}`,
        },
      });

      // Create metrics for this publication
      await prisma.publicationMetric.create({
        data: {
          publicationHistoryId: ph.id,
          likesCount: Math.floor(Math.random() * 80) + 5,
          commentsCount: Math.floor(Math.random() * 25) + 1,
          sharesCount: Math.floor(Math.random() * 10),
        },
      });
      console.log(
        `  Publication ${i + 1} for ${group.name} at ${publishedAt.toLocaleString("he-IL")}`,
      );
    }
  }

  console.log("\n✅ Test campaign created successfully!");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
