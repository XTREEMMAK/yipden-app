package com.yipden.app;

import android.os.Bundle;
import android.view.View;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;

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
}
