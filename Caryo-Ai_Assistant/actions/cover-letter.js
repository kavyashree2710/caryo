"use server";

import { db } from "@/lib/prisma";
import { auth, currentUser } from "@clerk/nextjs/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

/**
 * Safely fetch or link the current user to Prisma
 */
async function getDbUser(userId) {
  const clerkUser = await currentUser();

  if (!clerkUser) throw new Error("Unauthorized");

  // Try finding by clerkUserId
  let user = await db.user.findUnique({
    where: { clerkUserId: userId },
  });

  // If not found, try by email
  if (!user && clerkUser.emailAddresses?.length > 0) {
    user = await db.user.findUnique({
      where: { email: clerkUser.emailAddresses[0].emailAddress },
    });

    // Optionally: update db record to link with clerkUserId
    if (user && !user.clerkUserId) {
      user = await db.user.update({
        where: { id: user.id },
        data: { clerkUserId: userId },
      });
    }
  }

  if (!user) throw new Error("User not found");
  return user;
}

export async function generateCoverLetter(data) {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  const user = await getDbUser(userId);

  const prompt = `
    Write a professional cover letter for a ${data.jobTitle} position at ${data.companyName}.
    
    About the candidate:
    - Industry: ${user.industry || "Not specified"}
    - Years of Experience: ${user.experience || "Not specified"}
    - Skills: ${user.skills?.join(", ") || "Not specified"}
    - Professional Background: ${user.bio || "Not specified"}
    
    Job Description:
    ${data.jobDescription}
    
    Requirements:
    1. Use a professional, enthusiastic tone
    2. Highlight relevant skills and experience
    3. Show understanding of the company's needs
    4. Keep it concise (max 400 words)
    5. Use proper business letter formatting in markdown
    6. Include specific examples of achievements
    7. Relate candidate's background to job requirements
    
    Format the letter in markdown.
  `;

  try {
    const result = await model.generateContent(prompt);
    const content = result.response.text().trim();

    return await db.coverLetter.create({
      data: {
        content,
        jobDescription: data.jobDescription,
        companyName: data.companyName,
        jobTitle: data.jobTitle,
        status: "completed",
        userId: user.id,
      },
    });
  } catch (error) {
    console.error("Error generating cover letter:", error.message);
    throw new Error("Failed to generate cover letter");
  }
}

export async function getCoverLetters() {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  const user = await getDbUser(userId);

  return await db.coverLetter.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });
}

export async function getCoverLetter(id) {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  const user = await getDbUser(userId);

  return await db.coverLetter.findUnique({
    where: {
      id,
      userId: user.id,
    },
  });
}

export async function deleteCoverLetter(id) {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  const user = await getDbUser(userId);

  return await db.coverLetter.delete({
    where: {
      id,
      userId: user.id,
    },
  });
}
