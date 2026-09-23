package com.yipden.app;

import com.getcapacitor.BridgeActivity;

/**
 * BridgeActivity leaves the hardware and gesture back button at the platform default, which is
 * to exit immediately. Discover, Today, Follow and You are each a real route, so the WebView's
 * own navigation history already knows the way back between them; this only has to defer to it
 * before falling through to actually closing the app, the way every other Android app does.
 */
public class MainActivity extends BridgeActivity {

    @Override
    public void onBackPressed() {
        if (getBridge() != null && getBridge().getWebView().canGoBack()) {
            getBridge().getWebView().goBack();
        } else {
            super.onBackPressed();
        }
    }
}
