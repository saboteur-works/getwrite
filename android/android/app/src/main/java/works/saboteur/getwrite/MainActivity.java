package works.saboteur.getwrite;

import android.content.Intent;
import android.os.Bundle;
import android.util.Log;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    private static final String TAG = "ShareIn";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Diagnostic, kept on purpose (cheap): shows on a device run whether saved state
        // was present and which action and flags the launch Intent carried.
        Log.d(
            TAG,
            "MainActivity.onCreate savedState=" + (savedInstanceState != null)
                + " action=" + getIntent().getAction()
                + " flags=0x" + Integer.toHexString(getIntent().getFlags())
        );
        // Device measurement (Pixel 7 Pro): a share consumed and acknowledged, the app
        // backgrounded, the process killed with `am kill`, then reopened from Recents
        // delivered the same share again under a new shareId (violates FR-14). The
        // LAUNCHED_FROM_HISTORY check in ShareInPlugin did not stop it.
        // Reading, to be confirmed by the device run: a relaunch after process death
        // carries saved state, and the Intent is the original SEND one. A non-null
        // savedInstanceState means a previous instance already handled this launch
        // Intent, so strip it here, before super.onCreate (the plugin's load() and
        // BridgeActivity.load() -> onNewIntent(getIntent()) run inside it).
        // Known gap: a relaunch from Recents after a device reboot may have no saved
        // state and is not covered by this.
        if (savedInstanceState != null) {
            Intent handled = new Intent(getIntent());
            handled.removeExtra(Intent.EXTRA_TEXT);
            handled.removeExtra(Intent.EXTRA_STREAM);
            handled.setClipData(null);
            handled.setAction(Intent.ACTION_MAIN);
            setIntent(handled);
        }
        registerPlugin(ShareInPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
