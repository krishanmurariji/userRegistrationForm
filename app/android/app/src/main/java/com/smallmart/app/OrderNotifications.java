package com.smallmart.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import java.util.Map;

/** Builds the "new order" notification with Accept and Decline buttons, and the follow-up after a button is pressed. */
final class OrderNotifications {
    static final String CHANNEL = "new_orders";
    static final String RESULT_CHANNEL = "order_updates";
    static final String EXTRA_OPEN = "smallmart_open";

    private OrderNotifications() {}

    static int idFor(String orderId) {
        return orderId.hashCode() & 0x7fffffff;
    }

    static void ensureChannels(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager.getNotificationChannel(CHANNEL) == null) {
            NotificationChannel channel = new NotificationChannel(CHANNEL, "New orders", NotificationManager.IMPORTANCE_HIGH);
            channel.setDescription("Rings for every new order so you can accept or decline it");
            Uri sound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
            channel.setSound(sound, new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_NOTIFICATION_EVENT)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build());
            channel.enableVibration(true);
            channel.setVibrationPattern(new long[] {0, 400, 200, 400, 200, 400});
            channel.enableLights(true);
            channel.setLightColor(Color.rgb(155, 82, 39));
            channel.setLockscreenVisibility(NotificationCompat.VISIBILITY_PUBLIC);
            manager.createNotificationChannel(channel);
        }
        if (manager.getNotificationChannel(RESULT_CHANNEL) == null) {
            NotificationChannel quiet = new NotificationChannel(RESULT_CHANNEL, "Order updates", NotificationManager.IMPORTANCE_LOW);
            quiet.setDescription("Confirms what happened after you tap Accept or Decline");
            manager.createNotificationChannel(quiet);
        }
    }

    static void showNewOrder(Context context, Map<String, String> data) {
        String orderId = data.get("orderId");
        String token = data.get("actionToken");
        if (orderId == null || token == null) return;
        ensureChannels(context);
        int id = idFor(orderId);
        String title = valueOr(data.get("title"), "New order");
        String body = valueOr(data.get("body"), "Open Small Mart to see it");
        String lines = valueOr(data.get("lines"), "");
        String shop = valueOr(data.get("shopName"), "Small Mart");

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL)
                .setSmallIcon(R.drawable.ic_stat_order)
                .setColor(Color.rgb(155, 82, 39))
                .setContentTitle(title)
                .setContentText(body)
                .setSubText(shop)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(body + (lines.isEmpty() ? "" : "\n" + lines)))
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setCategory(NotificationCompat.CATEGORY_MESSAGE)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setDefaults(NotificationCompat.DEFAULT_ALL)
                .setAutoCancel(false)
                .setOngoing(true)
                .setTimeoutAfter(6L * 60 * 60 * 1000)
                .setContentIntent(openApp(context, id, "/shops/" + data.get("shopId") + "/orders/" + orderId))
                .addAction(0, "Decline", action(context, id, orderId, token, "decline"))
                .addAction(0, valueOr(data.get("acceptLabel"), "Accept"), action(context, id, orderId, token, "accept"));

        android.app.Notification notification = builder.build();
        // Keeps ringing until the owner looks at it, so an order is never missed.
        notification.flags |= android.app.Notification.FLAG_INSISTENT;
        try {
            NotificationManagerCompat.from(context).notify(id, notification);
        } catch (SecurityException ignored) {
            // Notifications are turned off for the app; the full-screen alert shows the order when the app opens.
        }
    }

    /** Replaces the ringing notification with a quiet one that says what happened. */
    static void showResult(Context context, String orderId, String text, boolean ok, String path) {
        ensureChannels(context);
        int id = idFor(orderId);
        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, RESULT_CHANNEL)
                .setSmallIcon(R.drawable.ic_stat_order)
                .setColor(ok ? Color.rgb(47, 107, 63) : Color.rgb(166, 58, 20))
                .setContentTitle(text)
                .setContentText(ok ? "Tap to open the order" : "Tap to open Small Mart")
                .setOnlyAlertOnce(true)
                .setSilent(true)
                .setAutoCancel(true)
                .setContentIntent(openApp(context, id, path));
        if (ok) builder.setTimeoutAfter(10L * 60 * 1000);
        try {
            NotificationManagerCompat.from(context).notify(id, builder.build());
        } catch (SecurityException ignored) {
        }
    }

    static void showWorking(Context context, String orderId, String text) {
        ensureChannels(context);
        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, RESULT_CHANNEL)
                .setSmallIcon(R.drawable.ic_stat_order)
                .setContentTitle(text)
                .setProgress(0, 0, true)
                .setOnlyAlertOnce(true)
                .setSilent(true)
                .setOngoing(true);
        try {
            NotificationManagerCompat.from(context).notify(idFor(orderId), builder.build());
        } catch (SecurityException ignored) {
        }
    }

    private static PendingIntent action(Context context, int id, String orderId, String token, String action) {
        Intent intent = new Intent(context, OrderActionReceiver.class)
                .setAction("com.smallmart.app.ORDER_" + action.toUpperCase())
                .putExtra("orderId", orderId)
                .putExtra("token", token)
                .putExtra("action", action);
        int request = id * 2 + ("accept".equals(action) ? 1 : 0);
        return PendingIntent.getBroadcast(context, request, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static PendingIntent openApp(Context context, int id, String path) {
        Intent intent = new Intent(context, MainActivity.class)
                .setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP)
                .putExtra(EXTRA_OPEN, path);
        return PendingIntent.getActivity(context, id, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static String valueOr(String value, String fallback) {
        return value == null || value.isEmpty() ? fallback : value;
    }
}
