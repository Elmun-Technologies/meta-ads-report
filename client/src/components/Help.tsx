import type { ReactNode } from "react";
import { Info } from "lucide-react";

/** Sahifa tepasidagi qisqa yo'riqnoma — "bu sahifada nima ko'rasiz" */
export function PageHint({ children }: { children: ReactNode }) {
  return (
    <div className="page-hint">
      <Info size={14} />
      <div>{children}</div>
    </div>
  );
}
