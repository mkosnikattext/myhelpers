import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { helpers } from "@/lib/helpers";
import { SiteHeader } from "@/components/site-header";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export function HelperHub() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="hub-shell">
        <section className="hub-intro" aria-labelledby="hub-title">
          <p className="eyebrow">Internal tools</p>
          <h1 id="hub-title">Helpers</h1>
          <p>Small tools for repetitive work. Pick one to get started.</p>
        </section>

        <section aria-label="Available helpers" className="helper-grid">
          <TooltipProvider delayDuration={120}>
            {helpers.map((helper) => {
              const Icon = helper.icon;
              return (
                <Tooltip key={helper.slug}>
                  <TooltipTrigger asChild>
                    <Link href={helper.href} className="helper-card group">
                      <span className={`helper-card__icon helper-card__icon--${helper.accent}`}>
                        <Icon aria-hidden="true" />
                      </span>
                      <span className="helper-card__copy">
                        <strong>{helper.title}</strong>
                        <span>{helper.description}</span>
                      </span>
                      <ArrowUpRight className="helper-card__arrow" aria-hidden="true" />
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent side="top" sideOffset={10} className="helper-tooltip">
                    Open {helper.title}
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </TooltipProvider>
        </section>
      </main>
    </div>
  );
}
