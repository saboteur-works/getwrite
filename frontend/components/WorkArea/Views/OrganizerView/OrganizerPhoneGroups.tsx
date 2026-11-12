import type { AnyResource } from "../../../../src/lib/models/types";
import type {
  OrganizerPhoneGroup,
  OrganizerPhoneGroupCard,
} from "./organizerGridModel";

/**
 * @module OrganizerPhoneGroups
 * Phone layout of the Organizer grid (FR-10): one labelled group per row value,
 * each a plain list of cards, with a text label per card naming its column
 * value(s). No `role="grid"`; every control is a button at least 44px square.
 */

/** Props accepted by {@link OrganizerPhoneGroups}. */
export interface OrganizerPhoneGroupsProps {
  /** Groups from `buildOrganizerPhoneGroups`; empty groups are kept and shown. */
  groups: OrganizerPhoneGroup[];
  /** Resources by card id. A card whose resource is missing still renders. */
  resourcesById: Record<string, AnyResource | undefined>;
  /** True when Rows is none: render one list with no group heading. */
  rowsNone?: boolean;
  /** Id of the globally selected resource; its card is marked in text. */
  selectedId?: string | null;
  /** Called with the card id when the title is activated. */
  onSelect?: (cardId: string) => void;
  /** Called with the card id when Open is activated. */
  onOpen?: (cardId: string) => void;
}

const HIT = "min-h-11 min-w-11";
const BUTTON_CLASS = `${HIT} inline-flex items-center justify-center px-3 rounded border border-gw-border bg-gw-chrome hover:bg-gw-chrome2 text-sm text-gw-primary`;

function titleOf(resource: AnyResource | undefined): string {
  if (!resource) return "Untitled";
  const named = resource as { title?: string };
  return named.title ?? resource.name ?? "Untitled";
}

function otherGroupsText(count: number): string {
  return `Same document, also in ${count} other ${count === 1 ? "group" : "groups"}`;
}

interface CardItemProps {
  entry: OrganizerPhoneGroupCard;
  resource: AnyResource | undefined;
  isSelected: boolean;
  onSelect?: (cardId: string) => void;
  onOpen?: (cardId: string) => void;
}

function CardItem({
  entry,
  resource,
  isSelected,
  onSelect,
  onOpen,
}: CardItemProps): JSX.Element {
  const title = titleOf(resource);
  return (
    <li className="border border-gw-border rounded p-2 flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          className={`${BUTTON_CLASS} flex-1 justify-start text-left`}
          onClick={() => onSelect?.(entry.cardId)}
          aria-current={isSelected ? "true" : undefined}
        >
          {title}
        </button>
        {onOpen && (
          <button
            type="button"
            className={BUTTON_CLASS}
            aria-label={`Open ${title}`}
            onClick={() => onOpen(entry.cardId)}
          >
            Open
          </button>
        )}
      </div>
      {resource && (
        <div className="text-xs text-gw-secondary">{resource.type} file</div>
      )}
      {entry.columnLabels.length > 0 && (
        <div className="text-xs text-gw-secondary">
          Column: {entry.columnLabels.join(", ")}
        </div>
      )}
      {entry.alsoInOtherGroups > 0 && (
        <div className="text-xs text-gw-secondary">
          {otherGroupsText(entry.alsoInOtherGroups)}
        </div>
      )}
      {isSelected && <div className="text-xs text-gw-secondary">Selected</div>}
    </li>
  );
}

/**
 * Grouped lists for the Organizer grid at phone width.
 *
 * @example
 * <OrganizerPhoneGroups groups={buildOrganizerPhoneGroups(model)} resourcesById={byId} />
 */
export default function OrganizerPhoneGroups({
  groups,
  resourcesById,
  rowsNone = false,
  selectedId = null,
  onSelect,
  onOpen,
}: OrganizerPhoneGroupsProps): JSX.Element {
  const renderCards = (cards: OrganizerPhoneGroupCard[]): JSX.Element => (
    <ul className="flex flex-col gap-2 list-none p-0 m-0">
      {cards.map((entry, i) => (
        <CardItem
          key={`${entry.cardId}-${entry.appearance}-${i}`}
          entry={entry}
          resource={resourcesById[entry.cardId]}
          isSelected={selectedId === entry.cardId}
          onSelect={onSelect}
          onOpen={onOpen}
        />
      ))}
    </ul>
  );

  if (rowsNone) {
    const cards = groups.flatMap((g) => g.cards);
    return <div className="flex flex-col gap-2">{renderCards(cards)}</div>;
  }

  return (
    <div className="flex flex-col gap-4">
      {groups.map((group) => {
        const headingId = `organizer-phone-group-${group.rowKey}`;
        return (
          <section
            key={group.rowKey}
            role="group"
            aria-labelledby={headingId}
            className="flex flex-col gap-2"
          >
            <h3 id={headingId} className="text-sm font-medium text-gw-primary">
              {group.label} ({group.cards.length})
            </h3>
            {group.cards.length === 0 ? (
              <p className="text-xs text-gw-secondary">
                No documents in {group.label}
              </p>
            ) : (
              renderCards(group.cards)
            )}
          </section>
        );
      })}
    </div>
  );
}
