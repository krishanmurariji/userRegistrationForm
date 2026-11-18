package com.smallmart.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;

/**
 * The Accept and Decline buttons on a new-order notification. Sends the decision to the server with the signed code
 * that came in the push, so it works without opening the app.
 */
public class OrderActionReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        final String orderId = intent.getStringExtra("orderId");
        final String token = intent.getStringExtra("token");
        final String action = intent.getStringExtra("action");
        if (orderId == null || token == null || action == null) return;

        final Context app = context.getApplicationContext();
        final PendingResult pending = goAsync();
        final boolean accept = "accept".equals(action);
        OrderNotifications.showWorking(app, orderId, accept ? "Accepting the order…" : "Declining the order…");

        new Thread(() -> {
            String path = "/";
            try {
                String apiUrl = app.getSharedPreferences(PushPlugin.PREFS, Context.MODE_PRIVATE).getString("apiUrl", null);
                if (apiUrl == null) throw new IllegalStateException("Open Small Mart once to finish setting up");
                JSONObject body = new JSONObject().put("token", token).put("action", action);
                HttpURLConnection connection = (HttpURLConnection) new URL(apiUrl + "/api/push/order-action").openConnection();
                connection.setConnectTimeout(10_000);
                connection.setReadTimeout(10_000);
                connection.setRequestMethod("POST");
                connection.setDoOutput(true);
                connection.setRequestProperty("Content-Type", "application/json");
                try (OutputStream out = connection.getOutputStream()) {
                    out.write(body.toString().getBytes(StandardCharsets.UTF_8));
                }
                int status = connection.getResponseCode();
                String text = read(status < 400 ? connection.getInputStream() : connection.getErrorStream());
                connection.disconnect();
                JSONObject json = text.isEmpty() ? new JSONObject() : new JSONObject(text);
                if (status < 400) {
                    OrderNotifications.showResult(app, orderId, json.optString("message", accept ? "Order accepted" : "Order declined"), true, path);
                } else {
                    String message = json.optString("detail", json.optString("title", "Could not update the order"));
                    OrderNotifications.showResult(app, orderId, message, false, path);
                }
            } catch (Exception e) {
                OrderNotifications.showResult(app, orderId, "No connection. Open Small Mart to handle the order.", false, path);
            } finally {
                pending.finish();
            }
        }).start();
    }

    private static String read(InputStream stream) throws java.io.IOException {
        if (stream == null) return "";
        try (InputStream in = stream; ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[4096];
            int n;
            while ((n = in.read(buffer)) > 0) out.write(buffer, 0, n);
            return out.toString("UTF-8");
        }
    }
}
