package com.playmyjam.app;

import android.content.SharedPreferences;
import android.content.res.Configuration;
import android.graphics.Color;
import android.view.View;
import android.view.Window;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Status bar ve alttaki hareket çubuğu şeritlerinin rengi.
 *
 * Android 15+ bu şeritleri boyatmaya izin vermiyor (edge-to-edge zorunlu;
 * StatusBar eklentisinin backgroundColor'ı etkisiz). Capacitor'un SystemBars'ı
 * WebView'i şeritlerin arasına sığdırıyor ve şeritlerde pencere zemini
 * görünüyor. Bu eklenti o zemini sitenin temasına eşitler — site açık/koyu
 * tema değişince çağırır (lib/native-app.ts → nativeSetSystemBars).
 *
 * Son renk saklanır: uygulama bir sonraki açılışta site yüklenmeden doğru
 * renkle başlar (açık temalı kullanıcıda koyu şerit yanıp sönmez).
 */
@CapacitorPlugin(name = "PmjSystemBars")
public class PmjSystemBarsPlugin extends Plugin {

    private static final String PREFS = "pmj_system_bars";
    private static final String KEY_COLOR = "background";
    private static final String KEY_DARK = "dark";

    private Integer background;
    private boolean dark = true;

    @Override
    public void load() {
        SharedPreferences prefs = getContext().getSharedPreferences(PREFS, 0);
        if (prefs.contains(KEY_COLOR)) {
            background = prefs.getInt(KEY_COLOR, 0);
            dark = prefs.getBoolean(KEY_DARK, true);
            getBridge().executeOnMainThread(this::applyLater);
        }
    }

    /** { background: "#rrggbb", dark: koyu zemin mi (true → açık renk ikonlar) } */
    @PluginMethod
    public void setColors(PluginCall call) {
        String hex = call.getString("background");
        int color;
        try {
            color = Color.parseColor(hex);
        } catch (Exception e) {
            call.reject("Geçersiz renk: " + hex);
            return;
        }
        background = color;
        dark = Boolean.TRUE.equals(call.getBoolean("dark", true));
        getContext().getSharedPreferences(PREFS, 0).edit().putInt(KEY_COLOR, color).putBoolean(KEY_DARK, dark).apply();
        getBridge().executeOnMainThread(() -> {
            apply();
            call.resolve();
        });
    }

    @Override
    protected void handleOnConfigurationChanged(Configuration newConfig) {
        super.handleOnConfigurationChanged(newConfig);
        // SystemBars da burada zemini temanın rengine sıfırlıyor; sırası belli
        // olmadığından onun ardından uygula
        applyLater();
    }

    private void applyLater() {
        if (background == null) return;
        getActivity().getWindow().getDecorView().post(this::apply);
    }

    private void apply() {
        if (background == null) return;
        Window window = getActivity().getWindow();
        View decor = window.getDecorView();
        decor.setBackgroundColor(background);
        WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(window, decor);
        controller.setAppearanceLightStatusBars(!dark);
        controller.setAppearanceLightNavigationBars(!dark);
    }
}
