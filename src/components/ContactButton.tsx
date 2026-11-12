import type { MouseEventHandler, ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ContactButton({
  href = "/contact",
  children = "Contact us",
  className,
  onClick,
}: {
  href?: string;
  children?: ReactNode;
  className?: string;
  onClick?: MouseEventHandler<HTMLAnchorElement>;
}) {
  return (
    <Button
      asChild
      className={cn(
        "h-auto min-h-11 max-w-full whitespace-normal rounded-xl bg-[#6A3AB2] px-4 py-3 text-center font-semibold text-white hover:bg-[#542e8e] focus-visible:ring-[#FF6F00]",
        className,
      )}
    >
      <a href={href} onClick={onClick}>
        {children}
        <ArrowRight aria-hidden="true" />
      </a>
    </Button>
  );
}
