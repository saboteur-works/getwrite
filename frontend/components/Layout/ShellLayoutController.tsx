"use client";

import React, { useEffect, useRef, useState } from "react";

export interface ShellLayoutRenderState {
    leftWidth: number;
    rightWidth: number;
    leftOpen: boolean;
    rightOpen: boolean;
    setLeftOpen: (open: boolean) => void;
    setRightOpen: (open: boolean) => void;
    startLeftResize: (event: React.MouseEvent<HTMLDivElement>) => void;
    startRightResize: (event: React.MouseEvent<HTMLDivElement>) => void;
}

export interface ShellLayoutControllerProps {
    children: (state: ShellLayoutRenderState) => React.ReactNode;
}

export default function ShellLayoutController({
    children,
}: ShellLayoutControllerProps): JSX.Element {
    const [leftWidth, setLeftWidth] = useState<number>(280);
    const [rightWidth, setRightWidth] = useState<number>(320);
    const [leftOpen, setLeftOpen] = useState<boolean>(true);
    const [rightOpen, setRightOpen] = useState<boolean>(true);

    const MIN_SIDEBAR_WIDTH = 160;
    const COLLAPSE_THRESHOLD = 120;

    const draggingRef = useRef<null | {
        side: "left" | "right";
        startX: number;
        startWidth: number;
    }>(null);

    useEffect(() => {
        const onMouseMove = (event: MouseEvent) => {
            const dragState = draggingRef.current;
            if (!dragState) {
                return;
            }

            const deltaX = event.clientX - dragState.startX;
            const maxWidth = 800;

            if (dragState.side === "left") {
                const next = dragState.startWidth + deltaX;
                if (next < COLLAPSE_THRESHOLD) {
                    setLeftOpen(false);
                } else {
                    setLeftOpen(true);
                    setLeftWidth(
                        Math.min(maxWidth, Math.max(MIN_SIDEBAR_WIDTH, next)),
                    );
                }
            } else {
                const next = dragState.startWidth - deltaX;
                if (next < COLLAPSE_THRESHOLD) {
                    setRightOpen(false);
                } else {
                    setRightOpen(true);
                    setRightWidth(
                        Math.min(maxWidth, Math.max(MIN_SIDEBAR_WIDTH, next)),
                    );
                }
            }

            document.body.style.userSelect = "none";
            document.body.style.cursor = "col-resize";
        };

        const onMouseUp = () => {
            draggingRef.current = null;
            document.body.style.userSelect = "";
            document.body.style.cursor = "";
        };

        window.addEventListener("mousemove", onMouseMove);
        window.addEventListener("mouseup", onMouseUp);

        return () => {
            window.removeEventListener("mousemove", onMouseMove);
            window.removeEventListener("mouseup", onMouseUp);
            document.body.style.userSelect = "";
            document.body.style.cursor = "";
        };
    }, []);

    const startLeftResize = (event: React.MouseEvent<HTMLDivElement>): void => {
        draggingRef.current = {
            side: "left",
            startX: event.clientX,
            startWidth: leftWidth,
        };
    };

    const startRightResize = (
        event: React.MouseEvent<HTMLDivElement>,
    ): void => {
        draggingRef.current = {
            side: "right",
            startX: event.clientX,
            startWidth: rightWidth,
        };
    };

    return (
        <>
            {children({
                leftWidth,
                rightWidth,
                leftOpen,
                rightOpen,
                setLeftOpen,
                setRightOpen,
                startLeftResize,
                startRightResize,
            })}
        </>
    );
}
