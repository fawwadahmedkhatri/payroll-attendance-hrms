"use client";

import { use } from "react";
import EmployeeDetailView from "@/components/views/EmployeeDetailView";

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <EmployeeDetailView id={id} />;
}
