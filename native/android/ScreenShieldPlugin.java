package app.jobcommand.shop;

import android.view.WindowManager;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Optional plugin if you want to toggle FLAG_SECURE from JS. MainActivity already enables it. */
@CapacitorPlugin(name = "ScreenShield")
public class ScreenShieldPlugin extends Plugin {
  @PluginMethod
  public void enable(PluginCall call) {
    getBridge().executeOnMainThread(() -> {
      getActivity().getWindow().setFlags(
        WindowManager.LayoutParams.FLAG_SECURE,
        WindowManager.LayoutParams.FLAG_SECURE
      );
      call.resolve();
    });
  }

  @PluginMethod
  public void disable(PluginCall call) {
    getBridge().executeOnMainThread(() -> {
      getActivity().getWindow().clearFlags(WindowManager.LayoutParams.FLAG_SECURE);
      call.resolve();
    });
  }
}
