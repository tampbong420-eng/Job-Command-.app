import UIKit
import Capacitor

/**
 * Job Command's bridge view controller: registers the local ScreenShield plugin.
 * After apply-ios-config.sh copies this into ios/App/App, open Main.storyboard in Xcode, select
 * "Bridge View Controller", and set Custom Class = MainViewController (Module: App).
 */
class MainViewController: CAPBridgeViewController {
  override open func capacitorDidLoad() {
    bridge?.registerPluginInstance(ScreenShieldPlugin())
  }
}
