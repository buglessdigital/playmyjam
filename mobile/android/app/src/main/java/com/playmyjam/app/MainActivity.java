package com.playmyjam.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Kendi eklentilerimiz super.onCreate'ten (köprü kurulmadan) önce kaydedilir
        registerPlugin(PmjSystemBarsPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
