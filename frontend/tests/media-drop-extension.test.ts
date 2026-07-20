import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleMediaDropFiles } from "../components/Editor/Extensions/MediaDropExtension";

const mockUpload = vi.fn();
vi.mock("../src/lib/api/resources", () => ({
  uploadMediaResource: (...args: unknown[]) => mockUpload(...args),
}));

function makeFile(name: string, type: string, size = 1024): File {
  return new File(["x".repeat(size)], name, { type });
}

describe("handleMediaDropFiles", () => {
  let errors: string[];
  let inserts: Array<{ resourceId: string; src: string }>;

  beforeEach(() => {
    errors = [];
    inserts = [];
    mockUpload.mockReset();
  });

  const onError = (msg: string) => errors.push(msg);
  const onInsert = (resourceId: string, src: string) =>
    inserts.push({ resourceId, src });

  it("uploads a valid image file and inserts a serving URL carrying the tenant-scoped projectId", async () => {
    mockUpload.mockResolvedValue({ resource: { id: "img-001" } });
    const file = makeFile("photo.png", "image/png");
    const projectId = "aaaaaaaa-1111-4111-8111-111111111111";

    await handleMediaDropFiles([file], projectId, onError, onInsert);

    expect(mockUpload).toHaveBeenCalledOnce();
    expect(mockUpload).toHaveBeenCalledWith(projectId, file);
    // Regression: the /file route hard-requires ?projectId=; a URL without it
    // 400s and the just-dropped image renders broken.
    expect(inserts).toEqual([
      {
        resourceId: "img-001",
        src: `/api/resource/img-001/file?projectId=${encodeURIComponent(
          projectId,
        )}`,
      },
    ]);
    expect(inserts[0].src).not.toContain("projectPath=");
    expect(errors).toHaveLength(0);
  });

  it("rejects an unsupported file type with a clear message", async () => {
    const file = makeFile(
      "document.docx",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );

    await handleMediaDropFiles([file], "/projects/proj-1", onError, onInsert);

    expect(mockUpload).not.toHaveBeenCalled();
    expect(inserts).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/unsupported/i);
  });

  it("rejects a file exceeding the 100 MB size cap", async () => {
    const bigSize = 101 * 1024 * 1024;
    const file = makeFile("huge.png", "image/png", bigSize);

    await handleMediaDropFiles([file], "/projects/proj-1", onError, onInsert);

    expect(mockUpload).not.toHaveBeenCalled();
    expect(inserts).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/100 MB/i);
  });

  it("rejects audio files with a message directing users to the resource tree", async () => {
    const file = makeFile("track.mp3", "audio/mpeg");

    await handleMediaDropFiles([file], "/projects/proj-1", onError, onInsert);

    expect(mockUpload).not.toHaveBeenCalled();
    expect(inserts).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/audio/i);
  });

  it("creates a distinct resource for each dropped image (no de-dup)", async () => {
    mockUpload
      .mockResolvedValueOnce({ resource: { id: "img-a" } })
      .mockResolvedValueOnce({ resource: { id: "img-b" } });

    const fileA = makeFile("a.jpg", "image/jpeg");
    const fileB = makeFile("b.webp", "image/webp");

    await handleMediaDropFiles(
      [fileA, fileB],
      "/projects/proj-1",
      onError,
      onInsert,
    );

    expect(mockUpload).toHaveBeenCalledTimes(2);
    expect(inserts).toHaveLength(2);
    expect(inserts[0].resourceId).toBe("img-a");
    expect(inserts[1].resourceId).toBe("img-b");
    expect(errors).toHaveLength(0);
  });

  it("continues processing remaining files when one upload fails", async () => {
    mockUpload
      .mockRejectedValueOnce(new Error("Network error"))
      .mockResolvedValueOnce({ resource: { id: "img-ok" } });

    const fileA = makeFile("bad.png", "image/png");
    const fileB = makeFile("good.gif", "image/gif");

    await handleMediaDropFiles(
      [fileA, fileB],
      "/projects/proj-1",
      onError,
      onInsert,
    );

    expect(inserts).toHaveLength(1);
    expect(inserts[0].resourceId).toBe("img-ok");
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/bad\.png/);
  });

  it("handles a mix of valid images and invalid files", async () => {
    mockUpload.mockResolvedValue({ resource: { id: "img-valid" } });

    const imageFile = makeFile("photo.jpg", "image/jpeg");
    const unknownFile = makeFile("data.csv", "text/csv");

    await handleMediaDropFiles(
      [imageFile, unknownFile],
      "/projects/proj-1",
      onError,
      onInsert,
    );

    expect(mockUpload).toHaveBeenCalledOnce();
    expect(inserts).toHaveLength(1);
    expect(errors).toHaveLength(1);
  });
});
