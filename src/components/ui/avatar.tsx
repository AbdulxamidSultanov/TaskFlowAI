"use client";

import {cn, initials} from "@/lib/utils";

const palette = [
    "#4F46E5",
    "#0891B2",
    "#059669",
    "#D97706",
    "#DC2626",
    "#7C3AED",
    "#DB2777",
    "#2563EB",
];

function colorFor(name: string) {
    let hash = 0;
    for (let index = 0; index < name.length; index += 1) {
        hash = (hash * 31 + name.charCodeAt(index)) >>> 0;
    }
    return palette[hash % palette.length];
}

export function Avatar({
    name,
    src,
    size = "md",
    className,
}: {
    name: string;
    src?: string | null;
    size?: "xs" | "sm" | "md" | "lg";
    className?: string;
}) {
    const sizeClass = {
        xs: "size-6 text-[10px]",
        sm: "size-8 text-xs",
        md: "size-10 text-sm",
        lg: "size-14 text-lg",
    }[size];

    if (src) {
        return (
            // eslint-disable-next-line @next/next/no-img-element
            <img
                src={src}
                alt={name}
                className={cn(
                    "shrink-0 rounded-full object-cover",
                    sizeClass,
                    className,
                )}
            />
        );
    }

    return (
        <span
            aria-hidden
            className={cn(
                "inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white",
                sizeClass,
                className,
            )}
            style={{backgroundColor: colorFor(name)}}
        >
            {initials(name) || "?"}
        </span>
    );
}
