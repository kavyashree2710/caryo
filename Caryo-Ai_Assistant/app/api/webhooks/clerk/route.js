// app/api/webhooks/clerk/route.js
import { db } from "@/lib/prisma"; // ✅ use your existing prisma client
import { Webhook } from "svix";
import { headers } from "next/headers";

export async function POST(req) {
  const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET;

  if (!WEBHOOK_SECRET) {
    return new Response("Missing Clerk webhook secret", { status: 500 });
  }

  // Verify webhook signature
  const headerPayload = headers();
  const svix_id = headerPayload.get("svix-id");
  const svix_timestamp = headerPayload.get("svix-timestamp");
  const svix_signature = headerPayload.get("svix-signature");

  if (!svix_id || !svix_timestamp || !svix_signature) {
    return new Response("Missing svix headers", { status: 400 });
  }

  const payload = await req.json();
  const body = JSON.stringify(payload);

  const wh = new Webhook(WEBHOOK_SECRET);

  let evt;
  try {
    evt = wh.verify(body, {
      "svix-id": svix_id,
      "svix-timestamp": svix_timestamp,
      "svix-signature": svix_signature,
    });
  } catch (err) {
    console.error("❌ Error verifying webhook:", err);
    return new Response("Invalid signature", { status: 400 });
  }

  // Handle event
  const eventType = evt.type;

  if (eventType === "user.created") {
    const { id, email_addresses, first_name, last_name, image_url } = evt.data;

    try {
      await db.user.upsert({
        where: { clerkUserId: id },
        update: {},
        create: {
          clerkUserId: id,
          email: email_addresses[0]?.email_address,
          name: `${first_name ?? ""} ${last_name ?? ""}`.trim(),
          imageUrl: image_url,
        },
      });
      console.log("✅ User synced to Neon DB:", id);
    } catch (error) {
      console.error("❌ Error inserting user:", error);
      return new Response("DB error", { status: 500 });
    }
  }

  return new Response("Webhook received", { status: 200 });
}
