package io.anypost.app;

import android.content.Intent;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AnypostBridgePlugin.class);
        super.onCreate(savedInstanceState);
        AnypostBridgePlugin.handleIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        AnypostBridgePlugin.handleIntent(intent);
    }
}
