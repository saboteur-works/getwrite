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
        <div className="flex">
            <button onClick={() => setIsOpen(!isOpen)} className="p-2">
                <EllipsisVertical size={20} className="hover:text-gray-400" />
            </button>
            {isOpen && (
                <div id={groupId} className="flex p-2" aria-label={groupName}>
                    {children}
                </div>
            )}
        </div>
    );
}
