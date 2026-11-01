"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Spinner } from "@/components/ui";
import { useAuth } from "@/lib/auth";

export default function Home() {
  const { me, loading, isHR } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (loading) return;
    router.replace(!me ? "/login" : isHR ? "/dashboard" : "/me");
  }, [me, loading, isHR, router]);
  return <Spinner />;
}
