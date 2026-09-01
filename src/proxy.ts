import { NextFetchEvent, NextRequest, NextResponse } from "next/server";
import { clerkEnabled } from "@/lib/teacher";

export default async function proxy(req: NextRequest, event: NextFetchEvent) {
  if (!clerkEnabled()) return NextResponse.next();
  const { clerkMiddleware } = await import("@clerk/nextjs/server");
  return clerkMiddleware()(req, event);
}

export const config = {
  matcher: ["/((?!_next|.*\\..*).*)", "/api/:path*"],
};
