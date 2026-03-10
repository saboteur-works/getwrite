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
    return (
        <div id={groupId} className="p-2" aria-label={groupName}>
            {children}
        </div>
    );
}
