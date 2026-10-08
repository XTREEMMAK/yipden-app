package com.yipden.app;

import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import com.getcapacitor.BridgeActivity;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.HashSet;
import java.util.Set;

/**
 * BridgeActivity leaves the hardware and gesture back button at the platform default, which is
 * to exit immediately. Discover, Today, Follow and You are each a real route, so the WebView's
 * own navigation history already knows the way back between them; this only has to defer to it
 * before falling through to actually closing the app, the way every other Android app does.
 *
 * This targets `OnBackPressedDispatcher` rather than overriding the classic `onBackPressed()`.
 * With `targetSdkVersion` 36, this app is opted into Android's predictive back gesture by
 * default (true since API 33 unless a manifest flag turns it off, which this app's does not),
 * and under that model the system dispatches through the callback below, not the deprecated
 * method. A first attempt overriding `onBackPressed()` directly looked correct by reading the
 * Capacitor source, but real device testing found it never fired at all.
 */
public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        /*
         * No SplashScreen.installSplashScreen() here, on purpose. The branded splash comes from the
         * launch theme alone (AppTheme.NoActionBarLaunch): Android 12+ draws it from the theme's
         * windowSplashScreen* attributes, and older versions show the same theme as the starting
         * window. Installing the AndroidX controller as well was the only native change in the
         * build where the card stack in Feeds and partner rings started to judder on a phone, with
         * Feeds' own web code unchanged, so it is out until that is proven innocent (2026-10-02).
         */
        super.onCreate(savedInstanceState);

        /*
         * CSS `overscroll-behavior` controls the content bounce, but Android's WebView has a
         * separate, native edge glow effect layered on top of it that the spec property does
         * not reach. Today's card stack reads scroll position every frame, so this is worth
         * ruling out as a contributor to a reported jump right at the top of a scroll, even
         * though the CSS side of that fix could not be reproduced in a browser to confirm it
         * was the whole story.
         */
        if (getBridge() != null) {
            getBridge().getWebView().setOverScrollMode(View.OVER_SCROLL_NEVER);
            clearCreatorMedia();
            addBandcampBridge();
        }

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (getBridge() != null && getBridge().getWebView().canGoBack()) {
                    getBridge().getWebView().goBack();
                    return;
                }
                // Nothing left to go back to: disable this callback and re-dispatch so the
                // next one in the chain (the platform default) actually closes the app,
                // rather than this callback catching its own re-dispatch forever.
                setEnabled(false);
                getOnBackPressedDispatcher().onBackPressed();
            }
        });
    }

    @Override
    public void onDestroy() {
        if (isFinishing()) clearCreatorMedia();
        super.onDestroy();
    }

    /*
     * Creators' images and pages the WebViews loaded sit in the app's HTTP cache, outside the
     * encrypted store, so they are cleared when the app closes. The cache is shared by every
     * WebView in the app, the in-app browser's included. A close Android never reports (the
     * process killed in the background) is caught by the same sweep on the next cold start.
     * Disabling caching for those loads instead is not possible from the page: an <img> cannot
     * ask for it. The app's own files come from the APK and are never in this cache.
     */
    /*
     * Bandcamp's embedded player has no API, so the app adds a small script to frames from
     * bandcamp.com, and only those, in this WebView only: it reports play, pause, time and the end
     * of a track to the app, and takes play, pause and seek from it. The script is
     * `assets/yipden/bandcamp-bridge.js`, with the app's own origin written in front of it, so it
     * talks to nothing else. The app's own page is told the bridge exists, so it can treat
     * Bandcamp like YouTube and SoundCloud. A WebView too old for document-start scripts gets
     * neither, and Bandcamp stays as it was: its own controls, and Next to move on.
     */
    private void addBandcampBridge() {
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) return;
        String appOrigin = originOf(getBridge().getAppUrl());
        if (appOrigin == null) return;
        String script;
        try (InputStream in = getAssets().open("yipden/bandcamp-bridge.js")) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buffer = new byte[4096];
            int read;
            while ((read = in.read(buffer)) != -1) out.write(buffer, 0, read);
            script = out.toString(StandardCharsets.UTF_8.name());
        } catch (Exception e) {
            return;
        }
        WebView webView = getBridge().getWebView();
        String quoted = "'" + appOrigin.replace("\\", "\\\\").replace("'", "\\'") + "'";
        Set<String> bandcamp = new HashSet<>();
        bandcamp.add("https://bandcamp.com");
        WebViewCompat.addDocumentStartJavaScript(webView, "var YIPDEN_APP = " + quoted + ";\n" + script, bandcamp);
        WebViewCompat.addDocumentStartJavaScript(
            webView,
            "window.__yipdenBandcampBridge = 1;",
            Collections.singleton(appOrigin)
        );
    }

    /** `scheme://host[:port]` of an address, the form an origin rule and postMessage expect. */
    private static String originOf(String url) {
        if (url == null) return null;
        Uri uri = Uri.parse(url);
        if (uri.getScheme() == null || uri.getHost() == null) return null;
        String origin = uri.getScheme() + "://" + uri.getHost();
        return uri.getPort() == -1 ? origin : origin + ":" + uri.getPort();
    }

    private void clearCreatorMedia() {
        if (getBridge() != null) getBridge().getWebView().clearCache(true);
    }
}
