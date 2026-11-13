package app.fitnova;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.res.AssetManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.util.Log;
import android.view.View;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.content.Intent;

import com.chaquo.python.PyObject;
import com.chaquo.python.Python;
import com.chaquo.python.android.AndroidPlatform;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;

/**
 * Hosts FitNova: extracts the bundled server/ and web/ folders, starts the Python server on
 * 127.0.0.1 (fixed port so the browser-storage profile key survives restarts) and shows it full-screen.
 * All data lives in the app's private storage (files/data/fitnova.db).
 */
public class MainActivity extends Activity {
    private static final String TAG = "FitNova";
    static final int PORT = 47615;

    private WebView web;

    // JavaScript is required by the app UI. It is safe here because the WebView only ever loads the
    // app's own bundled content from 127.0.0.1; any other URL is handed to the system browser.
    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#090B0E"));
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri u = request.getUrl();
                if ("127.0.0.1".equals(u.getHost())) return false;
                // External links open in the system browser, never inside the app.
                try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception ignored) { }
                return true;
            }
        });
        setContentView(web);

        if (savedInstanceState != null) {
            web.restoreState(savedInstanceState);
        }
        web.loadDataWithBaseURL(null, splashHtml("Starting FitNova…"), "text/html", "utf-8", null);

        new Thread(this::boot, "fitnova-boot").start();
    }

    private void boot() {
        try {
            File appDir = new File(getFilesDir(), "app");
            File dataDir = new File(getFilesDir(), "data");
            //noinspection ResultOfMethodCallIgnored
            dataDir.mkdirs();
            extractIfUpdated(appDir);
            if (!Python.isStarted()) Python.start(new AndroidPlatform(this));
            PyObject boot = Python.getInstance().getModule("fitnova_boot");
            int port = boot.callAttr("start", appDir.getAbsolutePath(),
                    new File(dataDir, "fitnova.db").getAbsolutePath(), PORT).toInt();
            runOnUiThread(() -> web.loadUrl("http://127.0.0.1:" + port + "/"));
        } catch (Throwable t) {
            Log.e(TAG, "Startup failed", t);
            final String msg = String.valueOf(t.getMessage()).replace("<", "&lt;");
            runOnUiThread(() -> web.loadDataWithBaseURL(null,
                    splashHtml("FitNova couldn't start.<br><small>" + msg + "</small>"), "text/html", "utf-8", null));
        }
    }

    /** Re-extract bundled code only when the APK changed; user data in files/data is never touched. */
    private void extractIfUpdated(File appDir) throws Exception {
        PackageInfo pi = getPackageManager().getPackageInfo(getPackageName(), 0);
        String stamp = pi.versionCode + ":" + pi.lastUpdateTime;
        SharedPreferences prefs = getSharedPreferences("fitnova", MODE_PRIVATE);
        if (stamp.equals(prefs.getString("extracted", "")) && new File(appDir, "server/app.py").exists()) return;
        deleteRecursive(appDir);
        copyAssetDir(getAssets(), "fitnova", appDir);
        prefs.edit().putString("extracted", stamp).apply();
    }

    private static void copyAssetDir(AssetManager am, String path, File dest) throws IOException {
        String[] children = am.list(path);
        if (children == null || children.length == 0) {
            //noinspection ResultOfMethodCallIgnored
            dest.getParentFile().mkdirs();
            try (InputStream in = am.open(path); OutputStream out = new FileOutputStream(dest)) {
                byte[] buf = new byte[16384];
                int n;
                while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            }
            return;
        }
        //noinspection ResultOfMethodCallIgnored
        dest.mkdirs();
        for (String c : children) copyAssetDir(am, path + "/" + c, new File(dest, c));
    }

    private static void deleteRecursive(File f) {
        if (!f.exists()) return;
        File[] kids = f.listFiles();
        if (kids != null) for (File k : kids) deleteRecursive(k);
        //noinspection ResultOfMethodCallIgnored
        f.delete();
    }

    private static String splashHtml(String text) {
        return "<html><head><meta name='viewport' content='width=device-width,initial-scale=1'></head>"
                + "<body style='margin:0;height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;"
                + "background:#090B0E;color:#F3F5F7;font-family:sans-serif;text-align:center'>"
                + "<div style='font-size:30px;font-weight:700'>Fit<span style='color:#2EE6FF'>Nova</span></div>"
                + "<div style='font-size:10px;letter-spacing:3px;color:#6E7682;margin-top:6px'>PERSONAL FITNESS INTELLIGENCE</div>"
                + "<div style='margin-top:28px;color:#A4ACB8;font-size:14px;padding:0 24px'>" + text + "</div></body></html>";
    }

    @Override
    public void onBackPressed() {
        if (web != null && web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        if (web != null) web.saveState(outState);
    }
}
