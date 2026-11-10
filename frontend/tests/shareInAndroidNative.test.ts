/**
 * Feature 107, Task 5 (FR-2, FR-3, FR-14, FR-16): the manifest filters and the
 * Java share-in plugin, checked as parsed XML and source text. This does not
 * compile or run the Java; behaviour on a device is not covered here.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { XMLParser } from "fast-xml-parser";
import { describe, expect, it } from "vitest";

const ANDROID_ROOT = path.resolve(
  __dirname,
  "../../android/android/app/src/main",
);
const JAVA_DIR = path.join(ANDROID_ROOT, "java/works/saboteur/getwrite");
const TYPES_PATH = path.resolve(
  __dirname,
  "../src/lib/api/share-capture-types.ts",
);

const manifestXml = readFileSync(
  path.join(ANDROID_ROOT, "AndroidManifest.xml"),
  "utf8",
);
const plugin = readFileSync(path.join(JAVA_DIR, "ShareInPlugin.java"), "utf8");
const mainActivity = readFileSync(
  path.join(JAVA_DIR, "MainActivity.java"),
  "utf8",
);
const contract = readFileSync(TYPES_PATH, "utf8");

interface XmlFilter {
  action: { "@_android:name": string } | Array<{ "@_android:name": string }>;
  category?: { "@_android:name": string } | Array<{ "@_android:name": string }>;
  data?:
    | { "@_android:mimeType": string }
    | Array<{ "@_android:mimeType": string }>;
}

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function parseManifest() {
  const parsed = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
  }).parse(manifestXml);
  const activities = asArray(parsed.manifest.application.activity) as Array<
    Record<string, unknown> & { "intent-filter": XmlFilter | XmlFilter[] }
  >;
  return activities;
}

function describeFilter(filter: XmlFilter): string {
  const actions = asArray(filter.action).map((a) => a["@_android:name"]);
  const categories = asArray(filter.category).map((c) => c["@_android:name"]);
  const types = asArray(filter.data).map((d) => d["@_android:mimeType"]);
  return JSON.stringify({ actions, categories, types });
}

describe("AndroidManifest.xml share filters", () => {
  const activities = parseManifest();

  it("declares MainActivity as the only activity, still singleTask", () => {
    expect(activities).toHaveLength(1);
    expect(activities[0]["@_android:name"]).toBe(".MainActivity");
    expect(activities[0]["@_android:launchMode"]).toBe("singleTask");
  });

  it("has MAIN/LAUNCHER plus exactly the three share filters", () => {
    const filters = asArray(activities[0]["intent-filter"]).map(describeFilter);
    expect(filters).toEqual([
      JSON.stringify({
        actions: ["android.intent.action.MAIN"],
        categories: ["android.intent.category.LAUNCHER"],
        types: [],
      }),
      JSON.stringify({
        actions: ["android.intent.action.SEND"],
        categories: ["android.intent.category.DEFAULT"],
        types: ["text/plain"],
      }),
      JSON.stringify({
        actions: ["android.intent.action.SEND"],
        categories: ["android.intent.category.DEFAULT"],
        types: ["image/*"],
      }),
      JSON.stringify({
        actions: ["android.intent.action.SEND_MULTIPLE"],
        categories: ["android.intent.category.DEFAULT"],
        types: ["image/*"],
      }),
    ]);
  });

  it("names no video, audio, application or wildcard type", () => {
    expect(manifestXml).not.toMatch(/video\/|audio\/|application\/|\*\/\*/);
  });
});

describe("MainActivity registration", () => {
  it("registers ShareInPlugin before super.onCreate", () => {
    const register = mainActivity.indexOf(
      "registerPlugin(ShareInPlugin.class)",
    );
    const superCreate = mainActivity.indexOf("super.onCreate(");
    expect(register).toBeGreaterThan(-1);
    expect(superCreate).toBeGreaterThan(register);
  });

  it("neutralises a launch intent already handled, before super.onCreate", () => {
    const superCreate = mainActivity.indexOf("super.onCreate(");
    const check = mainActivity.indexOf("savedInstanceState != null");
    const neutralise = mainActivity.indexOf("setIntent(");
    expect(check).toBeGreaterThan(-1);
    expect(check).toBeLessThan(superCreate);
    expect(neutralise).toBeGreaterThan(check);
    expect(neutralise).toBeLessThan(superCreate);
    expect(mainActivity).toMatch(/setAction\(\s*Intent\.ACTION_MAIN\s*\)/);
    expect(mainActivity).toMatch(/removeExtra\(\s*Intent\.EXTRA_TEXT\s*\)/);
    expect(mainActivity).toMatch(/removeExtra\(\s*Intent\.EXTRA_STREAM\s*\)/);
  });

  it("logs saved-state presence, action and flags for the device run", () => {
    expect(mainActivity).toMatch(/TAG\s*=\s*"ShareIn"/);
    expect(mainActivity).toMatch(/Log\.d\(\s*TAG/);
    expect(mainActivity).toContain("savedInstanceState != null");
    expect(mainActivity).toMatch(
      /Integer\.toHexString\(\s*getIntent\(\)\.getFlags\(\)/,
    );
  });

  it("keeps the LAUNCHED_FROM_HISTORY check in the plugin", () => {
    expect(plugin).toContain("FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY");
  });
});

describe("ShareInPlugin source", () => {
  it("overrides handleOnNewIntent and notifies with the retain flag", () => {
    expect(plugin).toMatch(/void\s+handleOnNewIntent\s*\(\s*Intent/);
    expect(plugin).toMatch(
      /notifyListeners\(\s*EVENT_NAME\s*,\s*event\s*,\s*true\s*\)/,
    );
  });

  it("exposes acknowledge, which clears the intent extras and action", () => {
    expect(plugin).toMatch(
      /@PluginMethod\s+public void acknowledge\(PluginCall/,
    );
    expect(plugin).toContain("removeExtra(Intent.EXTRA_STREAM)");
    expect(plugin).toContain("removeExtra(Intent.EXTRA_TEXT)");
    expect(plugin).toContain("setAction(Intent.ACTION_MAIN)");
  });

  it("delivers from both load() and handleOnNewIntent, and skips an intent already reported", () => {
    expect(plugin).toMatch(
      /void\s+load\s*\(\s*\)\s*\{\s*deliver\(getActivity\(\)\.getIntent\(\)\)/,
    );
    expect(plugin).toMatch(
      /handleOnNewIntent\s*\(\s*Intent\s+intent\s*\)\s*\{[^}]*deliver\(intent\)/,
    );
    const deliverBody = plugin.slice(plugin.indexOf("private void deliver("));
    expect(deliverBody).toMatch(
      /if\s*\(\s*intent\s*==\s*lastDeliveredIntent\s*\)\s*\{\s*return;/,
    );
    expect(deliverBody).toMatch(/lastDeliveredIntent\s*=\s*intent;/);
    const ack = plugin.slice(
      plugin.indexOf("public void acknowledge("),
      plugin.indexOf("private void clearIntent("),
    );
    expect(ack).not.toContain("lastDeliveredIntent");
  });

  it("reads the size column and type per item", () => {
    expect(plugin).toContain("OpenableColumns.SIZE");
    expect(plugin).toContain("getType(uri)");
  });

  it("never opens a stream or writes a file", () => {
    for (const forbidden of [
      "openInputStream",
      "openOutputStream",
      "openFileDescriptor",
      "openAssetFileDescriptor",
      "openFileOutput",
      "getCacheDir",
      "getFilesDir",
      "FileOutputStream",
      "FileWriter",
    ]) {
      expect(plugin).not.toContain(forbidden);
    }
  });

  it("matches the Task 2 contract names", () => {
    const eventName = /export type ShareReceivedEventName = "(\w+)"/.exec(
      contract,
    )?.[1];
    expect(eventName).toBe("shareReceived");
    expect(plugin).toContain(`EVENT_NAME = "${eventName}"`);
    expect(plugin).toContain('@CapacitorPlugin(name = "ShareIn")');
    for (const field of [
      "shareId",
      "items",
      "kind",
      "text",
      "uri",
      "name",
      "mimeType",
      "size",
    ]) {
      expect(contract).toContain(field);
      expect(plugin).toContain(`"${field}"`);
    }
    expect(contract).toMatch(/acknowledge: \(options: \{ shareId: string \}\)/);
  });
});
