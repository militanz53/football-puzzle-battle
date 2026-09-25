"use client";

import { useTransition } from "react";
import { deletePuzzle } from "@/app/admin/actions";
import { buttonClass } from "./ui";

export function DeleteButton({ id, label }: { id: string; label: string }) {
  const [pending, startTransition] = useTransition();

  function onClick() {
    if (!window.confirm(`Delete ${id} (${label})? This cannot be undone.`)) return;
    startTransition(async () => {
      const result = await deletePuzzle(id);
      if (!result.ok) window.alert(result.message);
    });
  }

  return (
    <button type="button" onClick={onClick} disabled={pending} className={buttonClass.danger}>
      {pending ? "Deleting…" : "Delete"}
    </button>
  );
}
