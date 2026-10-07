package app.jobcommand.shop;

import android.os.Bundle;
import android.view.WindowManager;
import com.getcapacitor.BridgeActivity;

/**
 * Drop this over android/app/src/main/java/app/jobcommand/shop/MainActivity.java
 * after `npx cap add android`. FLAG_SECURE blacks the screen in screenshots,
 * recordings, and the recents switcher. Chrome/Safari cannot do this.
 */
public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    getWindow().setFlags(
      WindowManager.LayoutParams.FLAG_SECURE,
      WindowManager.LayoutParams.FLAG_SECURE
    );
  }
}
