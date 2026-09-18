import { currentUser } from "@clerk/nextjs/server";
import { db } from "./prisma";

export const checkUser = async () => {
  const user = await currentUser();

  if (!user) {
    return null;
  }

  try {
    // Look for user by clerkUserId OR email
    const loggedInUser = await db.user.findFirst({
      where: {
        OR: [
          { clerkUserId: user.id },
          { email: user.emailAddresses[0].emailAddress },
        ],
      },
    });

    if (loggedInUser) {
      // Optionally: update clerkUserId if missing
      if (!loggedInUser.clerkUserId) {
        await db.user.update({
          where: { id: loggedInUser.id },
          data: { clerkUserId: user.id },
        });
      }
      return loggedInUser;
    }

    // If you NEVER want to auto-create users, just return null here:
    return null;

    // If you still want optional creation in some cases, uncomment:
    /*
    const name = `${user.firstName} ${user.lastName}`;
    const newUser = await db.user.create({
      data: {
        clerkUserId: user.id,
        name,
        imageUrl: user.imageUrl,
        email: user.emailAddresses[0].emailAddress,
      },
    });
    return newUser;
    */
  } catch (error) {
    console.error("Error in checkUser:", error.message);
    return null;
  }
};
