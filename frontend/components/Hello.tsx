import React from "react";

/** Tiny example component used in demos and stories. */
export default function Hello({ name = "writer" }: { name?: string }) {
    return (
        <div className="p-4 bg-gw-chrome rounded-md border-[0.5px] border-gw-border">
            Hello, {name} — GetWrite UI placeholder
        </div>
    );
}
