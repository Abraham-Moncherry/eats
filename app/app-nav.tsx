"use client";

import Link from "next/link";
import { CalendarDots, ForkKnife, House } from "@phosphor-icons/react";
import { usePathname } from "next/navigation";

const items = [
  { href: "/", label: "Today", icon: House },
  { href: "/history", label: "History", icon: CalendarDots },
  { href: "/library", label: "Library", icon: ForkKnife },
];

export default function AppNav() {
  const pathname = usePathname();

  return (
    <nav className="app-nav" aria-label="Primary navigation">
      {items.map(({ href, label, icon: Icon }) => {
        const active = pathname === href;
        return (
          <Link
            href={href}
            className={active ? "active" : ""}
            aria-current={active ? "page" : undefined}
            key={href}
          >
            <Icon weight={active ? "fill" : "regular"} />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
