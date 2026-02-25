package io.anypost.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.os.Build;
import android.os.IBinder;
import androidx.core.app.NotificationCompat;

public class AnypostForegroundService extends Service {
    static final String ACTION_START = "io.anypost.app.action.START_BACKGROUND_NODE";
    static final String ACTION_STOP = "io.anypost.app.action.STOP_BACKGROUND_NODE";

    private static final String CHANNEL_ID = "anypost-background-node";
    private static final String CHANNEL_NAME = "Anypost Background Node";
    private static final int NOTIFICATION_ID = 42420;

    @Override
    public void onCreate() {
        super.onCreate();
        ensureNotificationChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        final String action = intent != null ? intent.getAction() : null;
        if (ACTION_STOP.equals(action)) {
            stopForeground(STOP_FOREGROUND_REMOVE);
            stopSelf();
            AnypostBridgePlugin.notifyBackgroundNodeState(this, false);
            return START_NOT_STICKY;
        }

        startForeground(NOTIFICATION_ID, buildNotification());
        AnypostBridgePlugin.notifyBackgroundNodeState(this, true);
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        AnypostBridgePlugin.notifyBackgroundNodeState(this, false);
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private Notification buildNotification() {
        Intent openIntent = new Intent(this, MainActivity.class);
        openIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent openPendingIntent = PendingIntent.getActivity(
            this,
            1001,
            openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Intent stopIntent = new Intent(this, AnypostForegroundService.class);
        stopIntent.setAction(ACTION_STOP);
        PendingIntent stopPendingIntent = PendingIntent.getService(
            this,
            1002,
            stopIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle("Anypost background node is running")
            .setContentText("Tap to return to app or stop from Developer Tools.")
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setContentIntent(openPendingIntent)
            .addAction(0, "Stop", stopPendingIntent)
            .build();
    }

    private void ensureNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager == null) return;
        NotificationChannel existing = manager.getNotificationChannel(CHANNEL_ID);
        if (existing != null) return;
        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            CHANNEL_NAME,
            NotificationManager.IMPORTANCE_LOW
        );
        manager.createNotificationChannel(channel);
    }
}
