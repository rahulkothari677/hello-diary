package com.hellodiary.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import java.io.File;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
        // Resolve caching issues once and for all by deleting WebView Service Worker cache directory on startup.
        // This forces the WebView to fetch fresh assets from the Android app package.
        try {
            File webViewDir = this.getDir("webview", android.content.Context.MODE_PRIVATE);
            File serviceWorkerDir = new File(webViewDir, "Service Worker");
            if (serviceWorkerDir.exists()) {
                deleteDirRecursive(serviceWorkerDir);
                android.util.Log.i("MainActivity", "Successfully deleted WebView Service Worker folder to clear stale cache.");
            }
        } catch (Exception e) {
            android.util.Log.e("MainActivity", "Failed to delete WebView Service Worker folder: " + e.getMessage());
        }
    }

    private void deleteDirRecursive(File file) {
        if (file.isDirectory()) {
            File[] children = file.listFiles();
            if (children != null) {
                for (File child : children) {
                    deleteDirRecursive(child);
                }
            }
        }
        file.delete();
    }
}
