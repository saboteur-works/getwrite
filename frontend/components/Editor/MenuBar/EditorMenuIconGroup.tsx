import { EllipsisVertical } from "lucide-react";
import { useState } from "react";
interface EditorMenuIconGroupProps {
    groupName: string;
    groupId: string;
    children: React.ReactNode;
}

export default function EditorMenuIconGroup({
    groupName,
    groupId,
    children,
}: EditorMenuIconGroupProps) {
    const [isOpen, setIsOpen] = useState(true);

    return (
        <div className="editor-menu-group-root">
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className="editor-menu-group-toggle"
                aria-expanded={isOpen}
                aria-controls={groupId}
                aria-label={`Toggle ${groupName} controls`}
            >
                <EllipsisVertical size={18} />
            </button>
            {isOpen && (
                <div
                    id={groupId}
                    className="editor-menu-group"
                    aria-label={groupName}
                >
                    {children}
                </div>
            )}
        </div>
    );
}
