package com.smallmart.app;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.google.firebase.FirebaseApp;
import com.google.firebase.messaging.FirebaseMessaging;
import java.util.Map;

/**
 * Bridge between the web app and Android for order notifications: asks for permission, hands the Firebase token to
 * the web app (which sends it to the server), passes new orders to the full-screen alert while the app is open, and
 * opens the right page when a notification is tapped.
 */
@CapacitorPlugin(
    name = "SmallMartPush",
    permissions = @Permission(strings = { Manifest.permission.POST_NOTIFICATIONS }, alias = "notifications")
)
public class PushPlugin extends Plugin {
    static final String PREFS = "smallmart_push";
    private static volatile PushPlugin instance;
    private static volatile String pendingOpen;

    @Override
    public void load() {
        instance = this;
        OrderNotifications.ensureChannels(getContext());
        String path = pendingOpen;
        pendingOpen = null;
        if (path != null) emitOpen(path);
    }

    @Override
    protected void handleOnDestroy() {
        if (instance == this) instance = null;
    }

    /** Called with the launch intent: a tapped notification says which page to open. */
    static void handleLaunch(Intent intent) {
        if (intent == null) return;
        String path = intent.getStringExtra(OrderNotifications.EXTRA_OPEN);
        if (path == null) return;
        intent.removeExtra(OrderNotifications.EXTRA_OPEN);
        PushPlugin plugin = instance;
        if (plugin != null) plugin.emitOpen(path);
        else pendingOpen = path;
    }

    private void emitOpen(String path) {
        JSObject data = new JSObject();
        data.put("path", path);
        notifyListeners("open", data, true);
    }

    /** Hands a new order to the web app. Returns false when the app is not ready, so a notification is shown instead. */
    static boolean deliverNewOrder(Map<String, String> payload) {
        PushPlugin plugin = instance;
        if (plugin == null || !plugin.hasListeners("newOrder")) return false;
        JSObject data = new JSObject();
        for (Map.Entry<String, String> entry : payload.entrySet()) {
            if (!"actionToken".equals(entry.getKey())) data.put(entry.getKey(), entry.getValue());
        }
        plugin.notifyListeners("newOrder", data);
        return true;
    }

    @PluginMethod
    public void register(PluginCall call) {
        String apiUrl = call.getString("apiUrl");
        if (apiUrl != null) {
            getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString("apiUrl", apiUrl).apply();
        }
        if (Build.VERSION.SDK_INT >= 33 && getPermissionState("notifications") != PermissionState.GRANTED) {
            requestPermissionForAlias("notifications", call, "afterPermission");
            return;
        }
        fetchToken(call);
    }

    @PermissionCallback
    private void afterPermission(PluginCall call) {
        fetchToken(call);
    }

    private void fetchToken(PluginCall call) {
        JSObject result = new JSObject();
        result.put("permission", Build.VERSION.SDK_INT < 33 || getPermissionState("notifications") == PermissionState.GRANTED);
        if (FirebaseApp.getApps(getContext()).isEmpty()) {
            // Built without google-services.json: no push, the in-app alert still works.
            result.put("available", false);
            call.resolve(result);
            return;
        }
        FirebaseMessaging.getInstance().getToken().addOnCompleteListener(task -> {
            result.put("available", true);
            if (task.isSuccessful() && task.getResult() != null) {
                result.put("token", task.getResult());
                getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString("token", task.getResult()).apply();
            }
            call.resolve(result);
        });
    }

    /** Clears the ringing notification for an order handled inside the app. */
    @PluginMethod
    public void clear(PluginCall call) {
        String orderId = call.getString("orderId");
        if (orderId != null) {
            androidx.core.app.NotificationManagerCompat.from(getContext()).cancel(OrderNotifications.idFor(orderId));
        }
        call.resolve();
    }
}
