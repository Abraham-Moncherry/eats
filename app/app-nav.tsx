"use client";

import Link from "next/link";
import { History, House, Library } from "lucide-react";
import { usePathname } from "next/navigation";

const items = [
  { href: "/", label: "Today", icon: House },
  { href: "/history", label: "History", icon: History },
  { href: "/library", label: "Library", icon: Library },
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
            <Icon />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
