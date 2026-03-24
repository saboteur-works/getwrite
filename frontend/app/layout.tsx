import "./globals.css";
import "react-tooltip/dist/react-tooltip.css";
import React from "react";
import ClientProvider from "../src/store/ClientProvider";
import AppToaster from "../components/notifications/Toaster";
import AppearanceRuntime from "../components/preferences/AppearanceRuntime";

/** Page metadata for Next.js layout — basic title for dev/storybook. */
export const metadata = {
    title: "GetWrite — UI (placeholder)",
};

/** Application root layout wrapping `children` with global background and font color; imports global CSS. */
export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en">
            <head>
                <link rel="preconnect" href="https://fonts.googleapis.com" />
                <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
                <link
                    rel="stylesheet"
                    href="https://fonts.googleapis.com/css2?family=Domine:wght@400..700&display=swap"
                />
            </head>
            <body>
                <ClientProvider>
                    <AppearanceRuntime />
                    <div className="min-h-screen bg-gray-50 text-slate-900">
                        {children}
                        <AppToaster />
                    </div>
                </ClientProvider>
            </body>
        </html>
    );
}
