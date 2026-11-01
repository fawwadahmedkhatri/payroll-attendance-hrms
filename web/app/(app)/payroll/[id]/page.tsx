"use client";

import { use } from "react";
import PayrollRunView from "@/components/views/PayrollRunView";

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <PayrollRunView id={id} />;
}
