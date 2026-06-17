/**
 * @module editorExtensions
 *
 * Server-safe source of truth for the GetWrite document schema: the shared
 * TipTap extension list used both by the live editor ({@link TipTapEditor}) and
 * by the headless Markdown serializer (`src/lib/export/markdown-serializer`).
 *
 * This module is intentionally free of React, CSS, and Redux imports so it can
 * be imported in Node / API-route contexts without pulling in browser-only
 * dependencies.
 *
 * Runtime-configured extensions (CustomHeading, Math, MediaDrop, paste
 * normalization) are added by each consumer rather than here, because their
 * options differ between the editor and the serializer.
 */
import StarterKit from "@tiptap/starter-kit";
import {
  FontSize,
  FontFamily,
  TextStyle,
  Color,
  BackgroundColor,
} from "@tiptap/extension-text-style";
import Blockquote from "@tiptap/extension-blockquote";
import {
  BulletList,
  ListItem,
  ListKeymap,
  OrderedList,
} from "@tiptap/extension-list";
import CodeBlock from "@tiptap/extension-code-block";
import Highlight from "@tiptap/extension-highlight";
import UniqueID from "@tiptap/extension-unique-id";
import { Placeholder, Selection } from "@tiptap/extensions";
import Typography from "@tiptap/extension-typography";
import TextAlign from "@tiptap/extension-text-align";
import { TableKit } from "@tiptap/extension-table";
import GetWriteParagraphLeading from "./Extensions/GetWriteParagraphLeading";
import WikiLinkDecoration from "./Extensions/WikiLinkDecoration";
import GetWriteImage from "./Extensions/GetWriteImage";

/**
 * Shared base extension list defining the GetWrite document schema. Consumers
 * spread this and append their own runtime-configured extensions.
 */
export const baseSchemaExtensions = [
  StarterKit.configure({
    heading: false, // disabled — CustomHeading is used instead
    bulletList: false, // disabled — BulletList registered explicitly below
    orderedList: false, // disabled — OrderedList registered explicitly below
    listItem: false, // disabled — ListItem registered explicitly below
    blockquote: false, // disabled — Blockquote registered explicitly below
    codeBlock: false, // disabled — CodeBlock registered explicitly below
    listKeymap: false, // disabled — ListKeymap registered explicitly below
  }),
  TextStyle,
  Color,
  BackgroundColor,
  FontSize,
  Blockquote,
  BulletList,
  OrderedList,
  ListItem,
  ListKeymap,
  Highlight.configure({ multicolor: true }),
  CodeBlock.configure({ enableTabIndentation: true }),
  UniqueID.configure({
    types: ["paragraph", "heading", "blockquote", "codeBlock", "table"],
  }),
  TableKit.configure({ table: { resizable: true } }),
  Placeholder.configure({ placeholder: "Start writing here..." }),
  Selection,
  Typography,
  TextAlign.configure({ types: ["heading", "paragraph"] }),
  FontFamily,
  GetWriteParagraphLeading,
  WikiLinkDecoration,
  GetWriteImage,
];
