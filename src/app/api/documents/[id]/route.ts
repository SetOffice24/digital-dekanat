import { NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth";
import { documentForViewer, readDocument } from "@/server/services/documents";
import { contentDisposition } from "@/server/files";

/** Документ студента — только владельцу и деканату его факультета. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const d = await documentForViewer(user, (await params).id);
  if (!d) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const buf = await readDocument(d.storageKey);
  return new NextResponse(new Uint8Array(buf), {
    headers: { "Content-Type": d.mime, "Content-Disposition": contentDisposition(d.fileName).replace(/^attachment/, "inline"), "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
  });
}
