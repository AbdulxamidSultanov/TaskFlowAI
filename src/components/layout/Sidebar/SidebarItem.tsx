"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type SidebarItemProps = {
    href: string;
    label: string;
    icon: (active: boolean) => React.ReactNode;
    meta?: (active: boolean) => React.ReactNode;
};

function SidebarItem({ href, label, icon, meta }: SidebarItemProps) {
    const pathname = usePathname();

    const isActive =
        pathname === href || pathname.startsWith(`${href}/`);

    return (
        <Link
            href={href}
            aria-current={isActive ? "page" : undefined}
            className={[
                "flex w-full items-center gap-2 rounded-xl px-3 py-2.5",
                "text-sm/[20px] transition-colors",
                "focus-visible:outline-none focus-visible:ring-2",
                "focus-visible:ring-blue-500 focus-visible:ring-offset-2",
                isActive
                    ? "bg-blue-600 text-white"
                    : "text-text-primary hover:bg-blue-50 hover:text-blue-700",
            ].join(" ")}
        >
      <span className="flex size-4 shrink-0 items-center justify-center">
        {icon(isActive)}
      </span>

            <span className="min-w-0 flex-1 truncate">
        {label}
      </span>

            {meta ? (
                <span className="shrink-0">
          {meta(isActive)}
        </span>
            ) : null}
        </Link>
    );
}

export default SidebarItem;