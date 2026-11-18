package com.smallmart.app;

import androidx.annotation.NonNull;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;
import java.util.Map;

/** Receives Small Mart pushes, even when the app is closed. */
public class OrderMessagingService extends FirebaseMessagingService {
    @Override
    public void onMessageReceived(@NonNull RemoteMessage message) {
        Map<String, String> data = message.getData();
        if (!"new_order".equals(data.get("type"))) return;
        // App on screen: the full-screen alert takes over. Otherwise ring with Accept and Decline buttons.
        if (MainActivity.inForeground && PushPlugin.deliverNewOrder(data)) return;
        OrderNotifications.showNewOrder(this, data);
    }

    @Override
    public void onNewToken(@NonNull String token) {
        // Saved for the app, which sends it to the server the next time it starts.
        getSharedPreferences(PushPlugin.PREFS, MODE_PRIVATE).edit().putString("token", token).apply();
    }
}
