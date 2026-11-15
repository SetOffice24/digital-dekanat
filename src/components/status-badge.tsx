import type { RequestStatus } from "@prisma/client";
import { requestStatusLabel, requestStatusTone } from "@/lib/labels";
import { Badge } from "./ui";

export function StatusBadge({ status }: { status: RequestStatus }) {
  return <Badge tone={requestStatusTone[status]}>{requestStatusLabel[status]}</Badge>;
}
