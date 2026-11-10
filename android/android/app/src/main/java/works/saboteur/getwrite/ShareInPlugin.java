package works.saboteur.getwrite;

import android.content.ContentResolver;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.provider.OpenableColumns;
import android.util.Log;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * Share-in plugin (Feature 107). Reports what an Android share intent carries
 * (text, or image references with MIME type, name and size) to the web layer
 * as a retained `shareReceived` event. It reads metadata only: item bytes are
 * not read and nothing is written to disk. The web layer reads the bytes later,
 * after a project is chosen, and calls `acknowledge` once it has taken the
 * share, which clears the consumed intent.
 *
 * Event and method names match frontend/src/lib/api/share-capture-types.ts.
 */
@CapacitorPlugin(name = "ShareIn")
public class ShareInPlugin extends Plugin {

    private static final String TAG = "ShareIn";
    private static final String EVENT_NAME = "shareReceived";

    /** The intent whose share was last reported and is not yet acknowledged. */
    private Intent pendingIntent;
    private String pendingShareId;

    /**
     * The last intent object reported. Not cleared by acknowledge: a later
     * redelivery of the same object is dropped here (and by the action check,
     * since acknowledge sets the action to MAIN on it).
     */
    private Intent lastDeliveredIntent;

    /** Reports a share that launched the app (cold start). */
    @Override
    public void load() {
        deliver(getActivity().getIntent());
    }

    /** Reports a share delivered to the running app (singleTask). */
    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        deliver(intent);
    }

    /** Clears the consumed intent so it is not reported again. */
    @PluginMethod
    public void acknowledge(PluginCall call) {
        String shareId = call.getString("shareId");
        if (shareId == null) {
            call.reject("shareId is required");
            return;
        }
        if (shareId.equals(pendingShareId)) {
            clearIntent(pendingIntent);
            clearIntent(getActivity().getIntent());
            pendingIntent = null;
            pendingShareId = null;
        }
        call.resolve();
    }

    private void clearIntent(Intent intent) {
        if (intent == null) {
            return;
        }
        intent.removeExtra(Intent.EXTRA_TEXT);
        intent.removeExtra(Intent.EXTRA_STREAM);
        intent.setClipData(null);
        intent.setAction(Intent.ACTION_MAIN);
    }

    private void deliver(Intent intent) {
        // Reading of BridgeActivity.java:44-52 (Capacitor 8.4.2), not tested on its own:
        // load() creates the bridge and then calls onNewIntent(getIntent()), so a cold
        // start reaches this method twice with the same launch Intent (load() and
        // handleOnNewIntent). Both retained events would be replayed, so skip an
        // Intent object already reported.
        if (intent == lastDeliveredIntent) {
            return;
        }
        if (intent == null || (intent.getFlags() & Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY) != 0) {
            return;
        }
        String action = intent.getAction();
        if (!Intent.ACTION_SEND.equals(action) && !Intent.ACTION_SEND_MULTIPLE.equals(action)) {
            return;
        }
        JSArray items = new JSArray();
        try {
            for (JSObject item : collectItems(intent)) {
                items.put(item);
            }
        } catch (RuntimeException e) {
            // Logged, and nothing is sent: never a partial share.
            Log.e(TAG, "could not read the share", e);
            return;
        }
        if (items.length() == 0) {
            return;
        }
        String shareId = UUID.randomUUID().toString();
        JSObject event = new JSObject();
        event.put("shareId", shareId);
        event.put("items", items);
        lastDeliveredIntent = intent;
        pendingIntent = intent;
        pendingShareId = shareId;
        notifyListeners(EVENT_NAME, event, true);
    }

    private List<JSObject> collectItems(Intent intent) {
        List<JSObject> out = new ArrayList<>();
        String intentType = intent.getType();
        if (Intent.ACTION_SEND.equals(intent.getAction()) && "text/plain".equals(intentType)) {
            String text = intent.getStringExtra(Intent.EXTRA_TEXT);
            if (text != null && !text.isEmpty()) {
                JSObject item = new JSObject();
                item.put("kind", "text");
                item.put("text", text);
                out.add(item);
            }
            return out;
        }
        for (Uri uri : streamUris(intent)) {
            JSObject item = imageItem(uri, intentType);
            if (item != null) {
                out.add(item);
            }
        }
        return out;
    }

    private boolean isImage(String mimeType) {
        return mimeType != null && mimeType.startsWith("image/");
    }

    @SuppressWarnings("deprecation")
    private List<Uri> streamUris(Intent intent) {
        List<Uri> uris = new ArrayList<>();
        if (Intent.ACTION_SEND_MULTIPLE.equals(intent.getAction())) {
            ArrayList<Uri> list;
            if (Build.VERSION.SDK_INT >= 33) {
                list = intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM, Uri.class);
            } else {
                list = intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
            }
            if (list != null) {
                uris.addAll(list);
            }
            return uris;
        }
        Uri single;
        if (Build.VERSION.SDK_INT >= 33) {
            single = intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri.class);
        } else {
            single = intent.getParcelableExtra(Intent.EXTRA_STREAM);
        }
        if (single != null) {
            uris.add(single);
        }
        return uris;
    }

    /**
     * Builds one image item from the provider's metadata, or null when the
     * item's MIME type is not an image. `size` is omitted when the provider
     * does not report it.
     */
    private JSObject imageItem(Uri uri, String intentType) {
        ContentResolver resolver = getContext().getContentResolver();
        String mimeType = resolver.getType(uri);
        if (mimeType == null && isImage(intentType)) {
            mimeType = intentType;
        }
        if (!isImage(mimeType)) {
            return null;
        }
        String name = null;
        long size = -1;
        try (Cursor cursor = resolver.query(
            uri,
            new String[] { OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE },
            null,
            null,
            null
        )) {
            if (cursor != null && cursor.moveToFirst()) {
                int nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                int sizeIndex = cursor.getColumnIndex(OpenableColumns.SIZE);
                if (nameIndex >= 0 && !cursor.isNull(nameIndex)) {
                    name = cursor.getString(nameIndex);
                }
                if (sizeIndex >= 0 && !cursor.isNull(sizeIndex)) {
                    size = cursor.getLong(sizeIndex);
                }
            }
        }
        if (name == null) {
            name = uri.getLastPathSegment();
        }
        JSObject item = new JSObject();
        item.put("kind", "image");
        item.put("uri", uri.toString());
        item.put("name", name == null ? "" : name);
        item.put("mimeType", mimeType);
        if (size >= 0) {
            item.put("size", size);
        }
        return item;
    }
}
