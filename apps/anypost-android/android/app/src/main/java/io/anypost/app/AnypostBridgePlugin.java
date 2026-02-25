package io.anypost.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.atomic.AtomicInteger;

@CapacitorPlugin(name = "AnypostBridge")
public class AnypostBridgePlugin extends Plugin {
    private static final String CHANNEL_ID = "anypost-messages";
    private static final String CHANNEL_NAME = "Anypost Messages";
    private static final int MAX_PENDING_DEEP_LINKS = 24;
    private static final ConcurrentLinkedQueue<String> PENDING_DEEP_LINKS = new ConcurrentLinkedQueue<>();
    private static final AtomicInteger NEXT_NOTIFICATION_ID = new AtomicInteger(1);
    private static volatile AnypostBridgePlugin activeInstance;

    @Override
    public void load() {
        super.load();
        activeInstance = this;
        ensureNotificationChannel();
    }

    @Override
    protected void handleOnDestroy() {
        if (activeInstance == this) {
            activeInstance = null;
        }
        super.handleOnDestroy();
    }

    public static void handleIntent(Intent intent) {
        if (intent == null || intent.getData() == null) return;
        final String url = intent.getData().toString();
        if (url == null || !url.startsWith("anypost://")) return;
        enqueueDeepLink(url);
        final AnypostBridgePlugin instance = activeInstance;
        if (instance != null) {
            instance.emitDeepLink(url);
        }
    }

    @PluginMethod
    public void getPendingDeepLinks(PluginCall call) {
        JSArray urls = new JSArray();
        String next;
        while ((next = PENDING_DEEP_LINKS.poll()) != null) {
            urls.put(next);
        }
        JSObject payload = new JSObject();
        payload.put("urls", urls);
        call.resolve(payload);
    }

    @PluginMethod
    public void notifyMessage(PluginCall call) {
        final String title = trimToLimit(call.getString("title"), 120, "Anypost");
        final String body = trimToLimit(call.getString("body"), 300, "");
        final Context context = getContext();
        ensureNotificationChannel();
        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(title)
            .setContentText(body)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setAutoCancel(true);
        NotificationManagerCompat.from(context).notify(nextNotificationId(), builder.build());
        call.resolve();
    }

    @PluginMethod
    public void getRelayState(PluginCall call) {
        JSObject payload = new JSObject();
        payload.put("running", false);
        payload.put("listenAddrs", new JSArray());
        call.resolve(payload);
    }

    private static void enqueueDeepLink(String url) {
        while (PENDING_DEEP_LINKS.size() >= MAX_PENDING_DEEP_LINKS) {
            PENDING_DEEP_LINKS.poll();
        }
        PENDING_DEEP_LINKS.offer(url);
    }

    private void emitDeepLink(String url) {
        JSObject payload = new JSObject();
        payload.put("url", url);
        notifyListeners("deepLink", payload, true);
    }

    private void ensureNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        Context context = getContext();
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null) return;
        NotificationChannel existing = manager.getNotificationChannel(CHANNEL_ID);
        if (existing != null) return;
        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            CHANNEL_NAME,
            NotificationManager.IMPORTANCE_DEFAULT
        );
        manager.createNotificationChannel(channel);
    }

    private static int nextNotificationId() {
        int value = NEXT_NOTIFICATION_ID.getAndIncrement();
        if (value <= 0) {
            NEXT_NOTIFICATION_ID.set(1);
            return 1;
        }
        return value;
    }

    private static String trimToLimit(String value, int limit, String fallback) {
        if (value == null) return fallback;
        String trimmed = value.trim();
        if (trimmed.length() == 0) return fallback;
        if (trimmed.length() <= limit) return trimmed;
        return trimmed.substring(0, limit);
    }
}
