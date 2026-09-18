"use server";

import { db } from "@/lib/prisma";
import { auth, currentUser } from "@clerk/nextjs/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { revalidatePath } from "next/cache";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

// 🔎 Helper to fetch or link the current user
async function getDbUser() {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  const clerkUser = await currentUser();
  if (!clerkUser) throw new Error("Unauthorized");

  // Look up by clerkUserId or email
  let user = await db.user.findFirst({
    where: {
      OR: [
        { clerkUserId: userId },
        { email: clerkUser.emailAddresses[0].emailAddress },
      ],
    },
  });

  // If found by email but missing clerkUserId, update it
  if (user && !user.clerkUserId) {
    user = await db.user.update({
      where: { id: user.id },
      data: { clerkUserId: userId },
    });
  }

  if (!user) throw new Error("User not found");

  return user;
}

export async function saveResume(content) {
  const user = await getDbUser();

  try {
    const resume = await db.resume.upsert({
      where: { userId: user.id },
      update: { content },
      create: { userId: user.id, content },
    });

    revalidatePath("/resume");
    return resume;
  } catch (error) {
    console.error("Error saving resume:", error);
    throw new Error("Failed to save resume");
  }
}

export async function getResume() {
  const user = await getDbUser();

  return await db.resume.findUnique({
    where: { userId: user.id },
  });
}

export async function improveWithAI({ current, type }) {
  const user = await getDbUser();

  const prompt = `
    As an expert resume writer, improve the following ${type} description for a ${user.industry} professional.
    Make it more impactful, quantifiable, and aligned with industry standards.
    Current content: "${current}"

    Requirements:
    1. Use action verbs
    2. Include metrics and results where possible
    3. Highlight relevant technical skills
    4. Keep it concise but detailed
    5. Focus on achievements over responsibilities
    6. Use industry-specific keywords
    
    Format the response as a single paragraph without any additional text or explanations.
  `;

  try {
    const result = await model.generateContent(prompt);
    const response = result.response;
    const improvedContent = response.text().trim();
    return improvedContent;
  } catch (error) {
    console.error("Error improving content:", error);
    throw new Error("Failed to improve content");
  }
}
