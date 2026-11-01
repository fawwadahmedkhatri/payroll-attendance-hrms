"use client";

import { use } from "react";
import PayslipView from "@/components/views/PayslipView";

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <PayslipView id={id} />;
}
