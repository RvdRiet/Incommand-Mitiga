"use client";

import { useEffect } from "react";

import { installGlobalErrorHandlers } from "@/lib/errors/report";

/** Mounts once (root layout) to capture uncaught errors + unhandled promise rejections. */
export function GlobalErrorInit() {
  useEffect(() => {
    installGlobalErrorHandlers();
  }, []);
  return null;
}
