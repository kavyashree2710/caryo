"use server";

import { db } from "@/lib/prisma";
import { auth, currentUser } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { generateAIInsights } from "./dashboard";

/**
 * Update or create the current logged-in user's profile
 */
export async function updateUser(data) {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  const clerkUser = await currentUser();
  if (!clerkUser) throw new Error("Unauthorized");

  try {
    // -----------------------------------------
    // STEP 1: Generate AI insights BEFORE transaction
    // -----------------------------------------
    let insights = null;

    if (data.industry) {
      const existingIndustry = await db.industryInsight.findUnique({
        where: {
          industry: data.industry,
        },
      });

      if (!existingIndustry) {
        insights = await generateAIInsights(data.industry);
      }
    }

    // -----------------------------------------
    // STEP 2: Database transaction
    // -----------------------------------------
    const result = await db.$transaction(async (tx) => {
      let industryInsight = null;

      if (data.industry) {
        industryInsight = await tx.industryInsight.findUnique({
          where: {
            industry: data.industry,
          },
        });

        if (!industryInsight && insights) {
          industryInsight = await tx.industryInsight.create({
            data: {
              industry: data.industry,
              ...insights,
              nextUpdate: new Date(
                Date.now() + 7 * 24 * 60 * 60 * 1000
              ),
            },
          });
        }
      }

      let user = await tx.user.findFirst({
        where: {
          OR: [
            { clerkUserId: userId },
            { email: clerkUser.emailAddresses[0].emailAddress },
          ],
        },
      });

      if (!user) {
        user = await tx.user.create({
          data: {
            clerkUserId: userId,
            email: clerkUser.emailAddresses[0].emailAddress,
            name: `${clerkUser.firstName || ""} ${clerkUser.lastName || ""}`.trim(),
            imageUrl: clerkUser.imageUrl,
            industry: data.industry || null,
            bio: data.bio || null,
            experience: data.experience || null,
            skills: data.skills || null,
          },
        });
      } else {
        user = await tx.user.update({
          where: {
            id: user.id,
          },
          data: {
            industry: data.industry,
            bio: data.bio,
            experience: data.experience,
            skills: data.skills,
          },
        });
      }

      return { user };
    });

    revalidatePath("/dashboard");

    return result.user;
  } catch (error) {
    console.error("Error updating user:", error);
    throw new Error("Failed to update profile");
  }
}

/**
 * Check if the current user has completed onboarding
 */
export async function getUserOnboardingStatus() {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  const clerkUser = await currentUser();
  if (!clerkUser) throw new Error("Unauthorized");

  let user = await db.user.findFirst({
    where: {
      OR: [
        { clerkUserId: userId },
        { email: clerkUser.emailAddresses[0].emailAddress },
      ],
    },
  });

  if (!user) {
    user = await db.user.create({
      data: {
        clerkUserId: userId,
        email: clerkUser.emailAddresses[0].emailAddress,
        name: `${clerkUser.firstName || ""} ${clerkUser.lastName || ""}`.trim(),
        imageUrl: clerkUser.imageUrl,
        industry: null,
      },
    });
  }

  return {
    isOnboarded: Boolean(user.industry),
  };
}