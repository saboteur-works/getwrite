import {
  buildButtonClasses,
  iconRegistry,
  TOOLBAR_TOOLTIP_ID,
  type EditorMenuIconName,
} from "./editor-toolbar-icons";

export type { EditorMenuIconName };

export interface EditorMenuIconProps {
  iconSize?: number;
  Icon: EditorMenuIconName;
  onClick?: () => void;
  disabled?: boolean;
  active?: boolean;
  tooltipContent?: string;
}

export default function EditorMenuIcon({
  iconSize = 24,
  Icon,
  onClick,
  disabled,
  active,
  tooltipContent = "",
}: EditorMenuIconProps) {
  const IconComponent = iconRegistry[Icon];

  return (
    <button
      type="button"
      data-tooltip-id={TOOLBAR_TOOLTIP_ID}
      onClick={onClick}
      disabled={disabled}
      className={`editor-menu-icon-button ${buildButtonClasses(active, disabled)}`}
      data-tooltip-content={tooltipContent}
      aria-label={tooltipContent || Icon}
    >
      <IconComponent size={iconSize} />
    </button>
  );
}
