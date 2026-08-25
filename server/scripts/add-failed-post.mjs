/**
 * Add a failed publication history entry to DB for testing
 */
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  // Get the first user
  const user = await prisma.user.findFirst();
  if (!user) {
    console.log("No users found");
    return;
  }

  // Get a post that has postGroups
  const postGroup = await prisma.postGroup.findFirst({
    include: { post: true, group: true },
  });
  if (!postGroup) {
    console.log("No postGroups found");
    return;
  }
  const post = postGroup.post;
  const group = postGroup.group;
  const userId = post.userId;

  const result = await prisma.publicationHistory.create({
    data: {
      postId: post.id,
      groupId: group.id,
      userId: userId,
      postGroupId: postGroup?.id || null,
      publishedAt: new Date(),
      status: "FAILED",
      errorMessage:
        "שגיאת חיבור: לא ניתן להתחבר לפייסבוק — תוקף ההפעלה פג. יש להתחבר מחדש.",
    },
  });

  console.log("Created failed publication:", result.id);
  console.log("Post:", post.title || post.content?.slice(0, 40));
  console.log("Group:", group.name);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
