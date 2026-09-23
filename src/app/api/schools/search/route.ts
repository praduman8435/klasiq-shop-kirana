import { NextResponse } from "next/server";
import { z } from "zod";
import { searchSchools } from "@/server/queries/schools";

const querySchema = z.object({
  q: z.string().trim().max(100).optional().default(""),
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = querySchema.safeParse({ q: url.searchParams.get("q") ?? "" });

  if (!parsed.success) {
    return NextResponse.json({ schools: [] }, { status: 400 });
  }

  const schools = await searchSchools(parsed.data.q);
  return NextResponse.json({ schools });
}
