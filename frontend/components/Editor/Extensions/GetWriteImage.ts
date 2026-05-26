import Image from "@tiptap/extension-image";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    getWriteImage: {
      /** Insert an image resource by src URL and optional resource ID. */
      insertGetWriteImage: (options: {
        src: string;
        resourceId?: string;
        alt?: string;
        title?: string;
      }) => ReturnType;
    };
  }
}

/**
 * Extends TipTap's Image node with a `resourceId` attribute that links the
 * node back to a GetWrite image resource. The src URL points at the file-
 * serving route (`/api/resource/<id>/file`) and is stored directly in
 * content.tiptap.json so the image loads on reload without base64 embedding.
 */
const GetWriteImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      resourceId: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-resource-id"),
        renderHTML: (attrs) =>
          attrs.resourceId ? { "data-resource-id": attrs.resourceId } : {},
      },
    };
  },

  addCommands() {
    return {
      ...this.parent?.(),
      insertGetWriteImage:
        (options) =>
        ({ commands }) => {
          return commands.insertContent({ type: this.name, attrs: options });
        },
    };
  },
});

export default GetWriteImage;
