import Link from "next/link";
import { Boxes } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="site-header__inner">
        <Link href="/" className="brand" aria-label="Helper Hub home">
          <span className="brand__mark"><Boxes aria-hidden="true" /></span>
          <span>Helper Hub</span>
        </Link>
        <ThemeToggle />
      </div>
    </header>
  );
}
